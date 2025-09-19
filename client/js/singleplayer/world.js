define(['../../shared/js/gametypes'], function(Types) {

    var DEFAULTS = {
        spawn: { x: 65, y: 66 },
        mobs: [
            { kind: Types.Entities.RAT, x: 70, y: 68, maxHp: 20, damage: 6, loot: [Types.Entities.FLASK], respawnDelay: 8000 },
            { kind: Types.Entities.GOBLIN, x: 76, y: 72, maxHp: 35, damage: 9, loot: [Types.Entities.AXE], respawnDelay: 12000 },
            { kind: Types.Entities.SKELETON, x: 82, y: 69, maxHp: 30, damage: 8, loot: [Types.Entities.MAILARMOR], respawnDelay: 16000 }
        ],
        npcs: [
            { kind: Types.Entities.GUARD, x: 60, y: 64, orientation: Types.Orientations.DOWN },
            { kind: Types.Entities.VILLAGER, x: 62, y: 68, orientation: Types.Orientations.RIGHT },
            { kind: Types.Entities.PRIEST, x: 67, y: 61, orientation: Types.Orientations.DOWN }
        ],
        chests: [
            { x: 74, y: 67, loot: [Types.Entities.BURGER, Types.Entities.FLASK] },
            { x: 80, y: 74, loot: [Types.Entities.CAKE, Types.Entities.REDARMOR] }
        ]
    };

    function sanitizeName(name) {
        var value = (name || '').replace(/<[^>]*>/g, '');
        value = value.replace(/[^A-Za-z0-9 _-]/g, ' ');
        value = value.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        if(value.length === 0) {
            value = 'wanderer';
        }
        if(value.length > 15) {
            value = value.substr(0, 15);
        }
        return value;
    }

    function sanitizeChat(text) {
        var value = (text || '').replace(/<[^>]*>/g, '');
        value = value.replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
        if(value.length > 60) {
            value = value.substr(0, 60);
        }
        return value;
    }

    var LocalWorld = Class.extend({
        init: function(options) {
            options = options || {};
            this.map = options.map || null;
            this.storage = options.storage || null;
            this.pushCallback = options.push || null;

            this.spawn = options.spawn || DEFAULTS.spawn;
            this.templates = options.templates || DEFAULTS;

            this.tickRate = options.tickRate || 200;
            this.mobAggroRange = options.mobAggroRange || 6;
            this.mobLeashRange = options.mobLeashRange || 12;
            this.mobAttackDelay = options.mobAttackDelay || 900;
            this.regenInterval = options.regenInterval || 2000;
            this.chestRespawnDelay = options.chestRespawnDelay || 45000;

            this.player = null;
            this.entities = {};
            this.mobs = {};
            this.npcs = {};
            this.items = {};
            this.chests = {};
            this.mobRespawnTimers = {};
            this.chestRespawnTimers = {};
            this.nextEntityId = 2;
            this.tickTimer = null;
            this.regenTimer = null;

            this._populateStatics();
            this._startLoops();
        },

        handleHello: function(name, armorKind, weaponKind) {
            if(!armorKind) {
                armorKind = Types.Entities.CLOTHARMOR;
            }
            if(!weaponKind) {
                weaponKind = Types.Entities.SWORD1;
            }

            var spawn = this.spawn || { x: 10, y: 10 };
            this.player = {
                id: 1,
                type: 'player',
                kind: Types.Entities.WARRIOR,
                name: sanitizeName(name),
                x: spawn.x,
                y: spawn.y,
                orientation: Types.Orientations.DOWN,
                armor: armorKind,
                weapon: weaponKind,
                maxHp: this._computePlayerMaxHp(armorKind),
                hp: this._computePlayerMaxHp(armorKind),
                target: null,
                checkpoint: null
            };
            this.entities[this.player.id] = this.player;

            return {
                id: this.player.id,
                name: this.player.name,
                x: this.player.x,
                y: this.player.y,
                hp: this.player.hp,
                worldPopulation: 1,
                totalPopulation: 1,
                entityIds: this.buildEntityList()
            };
        },

        buildEntityList: function() {
            return _.chain(this.entities)
                    .keys()
                    .map(function(id) { return parseInt(id, 10); })
                    .reject(function(id) { return id === 1; })
                    .value();
        },

        getSpawnsFor: function(ids) {
            var self = this,
                packets = [];

            _.each(ids, function(id) {
                var entityId = parseInt(id, 10);
                if(entityId === 1 && self.player) {
                    packets.push(self._serializePlayer(self.player));
                } else {
                    var entity = self.entities[entityId];
                    if(entity) {
                        packets.push(self._serializeEntity(entity));
                    }
                }
            });

            return packets;
        },

        handleMove: function(playerId, x, y) {
            var packets = [];
            if(this.player && this._isValidPosition(x, y)) {
                this.player.x = x;
                this.player.y = y;
                this.player.target = null;
                packets.push([Types.Messages.MOVE, this.player.id, x, y]);
            }
            return packets;
        },

        handleLootMove: function(playerId, x, y, itemId) {
            var packets = this.handleMove(playerId, x, y);
            if(this.player && itemId && this.items[itemId]) {
                packets.push([Types.Messages.LOOTMOVE, this.player.id, parseInt(itemId, 10)]);
            }
            return packets;
        },

        handleAttack: function(playerId, targetId) {
            var packets = [];
            var target = this.entities[targetId];
            if(this.player && target && target.type === 'mob') {
                this.player.target = target.id;
                target.target = this.player.id;
                packets.push([Types.Messages.ATTACK, this.player.id, target.id]);
            }
            return packets;
        },

        handleAggro: function(mobId) {
            var mob = this.mobs[mobId];
            if(mob && this.player) {
                mob.target = this.player.id;
                this._push([[Types.Messages.ATTACK, mob.id, this.player.id]]);
            }
            return [];
        },

        handleHit: function(playerId, targetId) {
            var self = this,
                mob = this.mobs[targetId],
                packets = [];

            if(mob && !mob.isDead) {
                var damage = this._computePlayerDamage(this.player.weapon, mob.armor);
                mob.hp = Math.max(0, mob.hp - damage);
                packets.push([Types.Messages.DAMAGE, mob.id, damage]);

                if(mob.hp === 0) {
                    mob.isDead = true;
                    packets.push([Types.Messages.KILL, mob.kind]);
                    packets.push([Types.Messages.DESPAWN, mob.id]);
                    this._removeMob(mob);

                    var drops = this._dropForMob(mob);
                    _.each(drops, function(drop) {
                        packets.push([Types.Messages.DROP, mob.id, drop.id, drop.kind, [self.player.id]]);
                    });
                }
            }

            return packets;
        },

        handleHurt: function(attackerId) {
            var packets = [];
            var mob = this.mobs[attackerId];

            if(mob && this.player) {
                var damage = this._computeMobDamage(mob.damage, this.player.armor);
                this.player.hp = Math.max(0, this.player.hp - damage);
                packets.push([Types.Messages.HEALTH, this.player.hp]);

                if(this.player.hp === 0) {
                    this._handlePlayerDeath(packets);
                }
            }

            return packets;
        },

        handleLoot: function(playerId, itemId) {
            var packets = [],
                id = parseInt(itemId, 10),
                item = this.items[id];

            if(item) {
                packets.push([Types.Messages.DESTROY, item.id]);
                delete this.items[item.id];
                delete this.entities[item.id];

                if(Types.isArmor(item.kind)) {
                    this.player.armor = item.kind;
                    this.player.maxHp = this._computePlayerMaxHp(item.kind);
                    this.player.hp = this.player.maxHp;
                    packets.push([Types.Messages.EQUIP, this.player.id, item.kind]);
                    packets.push([Types.Messages.HP, this.player.maxHp]);
                } else if(Types.isWeapon(item.kind)) {
                    this.player.weapon = item.kind;
                    packets.push([Types.Messages.EQUIP, this.player.id, item.kind]);
                } else if(Types.isHealingItem(item.kind)) {
                    this._healPlayer(this._healingAmount(item.kind));
                    packets.push([Types.Messages.HEALTH, this.player.hp, 1]);
                }
            }

            return packets;
        },

        handleOpen: function(playerId, chestId) {
            var self = this,
                packets = [],
                id = parseInt(chestId, 10),
                chest = this.chests[id];

            if(chest) {
                packets.push([Types.Messages.DESPAWN, chest.id]);
                delete this.chests[chest.id];
                delete this.entities[chest.id];

                var drops = this._nextChestItems(chest);
                _.each(drops, function(kind) {
                    var item = self._spawnItem(kind, chest.x, chest.y, [playerId]);
                    packets.push([Types.Messages.DROP, chest.id, item.id, item.kind, [playerId]]);
                });

                this._scheduleChestRespawn(chest.template || chest, chest.respawnDelay);
            }

            return packets;
        },

        handleTeleport: function(playerId, x, y) {
            var packets = [];
            if(this.player && this._isValidPosition(x, y)) {
                this.player.x = x;
                this.player.y = y;
                this.player.target = null;
                packets.push([Types.Messages.TELEPORT, this.player.id, x, y]);
            }
            return packets;
        },

        handleZone: function(playerId) {
            var list = this.buildEntityList();
            list.unshift(Types.Messages.LIST);
            return [list];
        },

        handleChat: function(playerId, message) {
            var text = sanitizeChat(message);
            if(text && text.length > 0) {
                return [[Types.Messages.CHAT, this.player.id, text]];
            }
            return [];
        },

        handleCheck: function(checkpointId) {
            if(this.player) {
                this.player.checkpoint = checkpointId;
            }
            return [];
        },

        destroy: function() {
            var self = this;
            if(this.tickTimer) {
                clearInterval(this.tickTimer);
                this.tickTimer = null;
            }
            if(this.regenTimer) {
                clearInterval(this.regenTimer);
                this.regenTimer = null;
            }
            _.each(this.mobRespawnTimers, function(timer, key) {
                if(timer) {
                    clearTimeout(timer);
                }
                delete self.mobRespawnTimers[key];
            });
            _.each(this.chestRespawnTimers, function(timer, key) {
                if(timer) {
                    clearTimeout(timer);
                }
                delete self.chestRespawnTimers[key];
            });
        },

        _populateStatics: function() {
            var self = this,
                templates = this.templates || DEFAULTS;

            _.each(templates.npcs || [], function(npc) {
                self._spawnNpc(npc);
            });
            _.each(templates.mobs || [], function(mob) {
                self._spawnMob(mob);
            });
            _.each(templates.chests || [], function(chest) {
                self._spawnChest(chest);
            });
        },

        _startLoops: function() {
            var self = this;
            if(!this.tickTimer) {
                this.tickTimer = setInterval(function() {
                    self._tick();
                }, this.tickRate);
            }
            if(!this.regenTimer) {
                this.regenTimer = setInterval(function() {
                    self._regenTick();
                }, this.regenInterval);
            }
        },

        _tick: function() {
            if(!this.player) {
                return;
            }
            this._updateMobs();
        },

        _regenTick: function() {
            if(this.player && this.player.hp < this.player.maxHp) {
                var amount = Math.max(1, Math.floor(this.player.maxHp / 25));
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
                this._push([[Types.Messages.HEALTH, this.player.hp, 1]]);
            }
        },

        _spawnNpc: function(data) {
            var id = this._nextEntityId();
            var npc = {
                id: id,
                type: 'npc',
                kind: data.kind,
                x: data.x,
                y: data.y,
                orientation: data.orientation || Types.Orientations.DOWN
            };
            this.npcs[id] = npc;
            this.entities[id] = npc;
            return npc;
        },

        _spawnMob: function(data) {
            var id = this._nextEntityId();
            var mob = {
                id: id,
                type: 'mob',
                kind: data.kind,
                x: data.x,
                y: data.y,
                orientation: data.orientation || Types.Orientations.DOWN,
                maxHp: data.maxHp || 30,
                hp: data.maxHp || 30,
                armor: data.armor || 4,
                damage: data.damage || 6,
                loot: data.loot || [],
                lootIndex: 0,
                respawnDelay: data.respawnDelay || 12000,
                template: data,
                spawnX: data.x,
                spawnY: data.y,
                aggroRange: data.aggroRange || this.mobAggroRange,
                leashRange: data.leashRange || this.mobLeashRange,
                attackDelay: data.attackDelay || this.mobAttackDelay,
                nextAttackTime: 0
            };
            this.mobs[id] = mob;
            this.entities[id] = mob;
            return mob;
        },

        _spawnChest: function(data) {
            var id = this._nextEntityId();
            var chest = {
                id: id,
                type: 'chest',
                kind: Types.Entities.CHEST,
                x: data.x,
                y: data.y,
                loot: data.loot || [],
                lootIndex: 0,
                respawnDelay: data.respawnDelay || this.chestRespawnDelay,
                template: data
            };
            this.chests[id] = chest;
            this.entities[id] = chest;
            return chest;
        },

        _spawnItem: function(kind, x, y, players) {
            var id = this._nextEntityId();
            var item = {
                id: id,
                type: 'item',
                kind: kind,
                x: x,
                y: y,
                players: players || []
            };
            this.items[id] = item;
            this.entities[id] = item;
            return item;
        },

        _serializePlayer: function(player) {
            var state = [Types.Messages.SPAWN,
                         player.id,
                         player.kind,
                         player.x,
                         player.y,
                         player.name,
                         player.orientation,
                         player.armor,
                         player.weapon];
            if(player.target) {
                state.push(player.target);
            }
            return state;
        },

        _serializeEntity: function(entity) {
            var state = [Types.Messages.SPAWN,
                         entity.id,
                         entity.kind,
                         entity.x,
                         entity.y];
            if(entity.type === 'mob') {
                state.push(entity.orientation);
                if(entity.target) {
                    state.push(entity.target);
                }
            }
            return state;
        },

        _removeMob: function(mob) {
            delete this.entities[mob.id];
            delete this.mobs[mob.id];
            this._scheduleMobRespawn(mob.template, mob.respawnDelay);
        },

        _scheduleMobRespawn: function(template, delay) {
            var self = this;
            if(!template) {
                return;
            }
            var respawnDelay = delay || template.respawnDelay || 12000;
            var key = template.kind + ':' + template.x + ':' + template.y;
            if(this.mobRespawnTimers[key]) {
                clearTimeout(this.mobRespawnTimers[key]);
            }
            this.mobRespawnTimers[key] = setTimeout(function() {
                delete self.mobRespawnTimers[key];
                var mob = self._spawnMob(template);
                self._push([[Types.Messages.SPAWN,
                              mob.id,
                              mob.kind,
                              mob.x,
                              mob.y,
                              mob.orientation]]);
            }, respawnDelay);
        },

        _scheduleChestRespawn: function(template, delay) {
            var self = this;
            if(!template) {
                return;
            }
            var respawnDelay = delay || template.respawnDelay || this.chestRespawnDelay;
            var key = template.x + ':' + template.y;
            if(this.chestRespawnTimers[key]) {
                clearTimeout(this.chestRespawnTimers[key]);
            }
            this.chestRespawnTimers[key] = setTimeout(function() {
                delete self.chestRespawnTimers[key];
                var chest = self._spawnChest(template);
                self._push([[Types.Messages.SPAWN,
                              chest.id,
                              chest.kind,
                              chest.x,
                              chest.y]]);
            }, respawnDelay);
        },

        _dropForMob: function(mob) {
            var self = this,
                drops = [];

            if(!mob || !mob.loot || mob.loot.length === 0) {
                return drops;
            }

            var entry = mob.loot[mob.lootIndex % mob.loot.length];
            mob.lootIndex += 1;

            var kinds = _.isArray(entry) ? entry : [entry];
            _.each(kinds, function(kind) {
                var item = self._spawnItem(kind, mob.x, mob.y, [self.player.id]);
                drops.push(item);
            });

            return drops;
        },

        _nextChestItems: function(chest) {
            if(!chest || !chest.loot || chest.loot.length === 0) {
                return [];
            }
            var entry = chest.loot[chest.lootIndex % chest.loot.length];
            chest.lootIndex += 1;
            return _.isArray(entry) ? entry : [entry];
        },

        _healPlayer: function(amount) {
            if(this.player) {
                this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
            }
        },

        _healingAmount: function(kind) {
            switch(kind) {
                case Types.Entities.FLASK:
                    return 40;
                case Types.Entities.BURGER:
                    return 100;
                case Types.Entities.CAKE:
                    return 60;
            }
            return 0;
        },

        _computePlayerDamage: function(weaponKind, armor) {
            var rank = Types.getWeaponRank(weaponKind);
            return 10 + (rank * 5);
        },

        _computeMobDamage: function(base, armorKind) {
            var mitigation = 2 * Types.getArmorRank(armorKind);
            return Math.max(1, base - mitigation);
        },

        _computePlayerMaxHp: function(armorKind) {
            return 100 + (Types.getArmorRank(armorKind) * 20);
        },

        _handlePlayerDeath: function(packets) {
            var spawn = this.spawn || { x: 10, y: 10 };
            this.player.x = spawn.x;
            this.player.y = spawn.y;
            this.player.hp = this.player.maxHp;
            packets.push([Types.Messages.TELEPORT, this.player.id, this.player.x, this.player.y]);
            packets.push([Types.Messages.HEALTH, this.player.hp, 1]);
            this._resetMobTargets();
        },

        _resetMobTargets: function() {
            var self = this;
            _.each(this.mobs, function(mob) {
                self._clearMobTarget(mob);
            });
        },

        _clearMobTarget: function(mob) {
            if(mob) {
                mob.target = null;
                mob.nextAttackTime = 0;
            }
        },

        _nextEntityId: function() {
            return this.nextEntityId++;
        },

        _isValidPosition: function(x, y) {
            if(!this.map || !this.map.isColliding) {
                return true;
            }
            return !this.map.isColliding(x, y);
        },

        _push: function(messages) {
            if(this.pushCallback && messages && messages.length > 0) {
                this.pushCallback(messages);
            }
        },

        _updateMobs: function() {
            var self = this;
            _.each(this.mobs, function(mob) {
                if(mob.isDead) {
                    return;
                }
                self._updateMobTarget(mob);
                self._updateMobMovement(mob);
                self._updateMobAttack(mob);
            });
        },

        _updateMobTarget: function(mob) {
            if(!this.player) {
                return;
            }
            var distance = this._distance(mob.x, mob.y, this.player.x, this.player.y);

            if(!mob.target && distance <= (mob.aggroRange || this.mobAggroRange)) {
                mob.target = this.player.id;
                this._push([[Types.Messages.ATTACK, mob.id, this.player.id]]);
            } else if(mob.target && distance > (mob.leashRange || this.mobLeashRange)) {
                this._clearMobTarget(mob);
            }
        },

        _updateMobMovement: function(mob) {
            var target = mob.target ? this.entities[mob.target] : null;

            if(target && target.id === this.player.id && this.player.hp > 0) {
                var distance = this._distance(mob.x, mob.y, target.x, target.y);
                if(distance > 1) {
                    var next = this._stepTowards(mob.x, mob.y, target.x, target.y);
                    if(next && this._isValidPosition(next.x, next.y)) {
                        mob.x = next.x;
                        mob.y = next.y;
                        this._push([[Types.Messages.MOVE, mob.id, mob.x, mob.y]]);
                    }
                }
            } else if(!mob.target && (mob.x !== mob.spawnX || mob.y !== mob.spawnY)) {
                var home = this._stepTowards(mob.x, mob.y, mob.spawnX, mob.spawnY);
                if(home && this._isValidPosition(home.x, home.y)) {
                    mob.x = home.x;
                    mob.y = home.y;
                    this._push([[Types.Messages.MOVE, mob.id, mob.x, mob.y]]);
                }
            }
        },

        _updateMobAttack: function(mob) {
            if(!mob.target || !this.player || this.player.hp <= 0) {
                return;
            }
            if(mob.target !== this.player.id) {
                return;
            }
            var distance = this._distance(mob.x, mob.y, this.player.x, this.player.y);
            if(distance > 1) {
                return;
            }

            var now = Date.now();
            if(!mob.nextAttackTime || now >= mob.nextAttackTime) {
                mob.nextAttackTime = now + (mob.attackDelay || this.mobAttackDelay);
                this._push(this.handleHurt(mob.id));
            }
        },

        _stepTowards: function(x1, y1, x2, y2) {
            var dx = x2 - x1,
                dy = y2 - y1,
                stepX = x1,
                stepY = y1;

            if(dx === 0 && dy === 0) {
                return null;
            }

            if(Math.abs(dx) >= Math.abs(dy)) {
                stepX += dx > 0 ? 1 : -1;
                if(this._isValidPosition(stepX, stepY)) {
                    return { x: stepX, y: stepY };
                }
                stepX = x1;
            }

            if(dy !== 0) {
                stepY += dy > 0 ? 1 : -1;
                if(this._isValidPosition(stepX, stepY)) {
                    return { x: stepX, y: stepY };
                }
            }

            if(dx !== 0) {
                stepX += dx > 0 ? 1 : -1;
                if(this._isValidPosition(stepX, y1)) {
                    return { x: stepX, y: y1 };
                }
            }
            return null;
        },

        _distance: function(x1, y1, x2, y2) {
            return Math.abs(x1 - x2) + Math.abs(y1 - y2);
        }
    });

    return LocalWorld;
});
