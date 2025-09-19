define(['gameclient', 'singleplayer/world', '../../shared/js/gametypes'],
function(GameClient, LocalWorld, Types) {

    var LocalGameClient = GameClient.extend({
        init: function(host, port, options) {
            this._super(host, port);
            options = options || {};
            var self = this;

            options.push = function(messages) {
                self._dispatch(messages);
            };

            this.world = new LocalWorld(options);
            this.playerId = null;
        },

        connect: function() {
            var self = this;
            setTimeout(function() {
                if(self.connected_callback) {
                    self.connected_callback();
                }
            }, 0);
        },

        sendMessage: function(message) {
            var action = message[0];

            switch(action) {
                case Types.Messages.HELLO:
                    this._handleHello(message);
                    break;
                case Types.Messages.WHO:
                    this._dispatch(this.world.getSpawnsFor(message.slice(1)));
                    break;
                case Types.Messages.MOVE:
                    this._dispatch(this.world.handleMove(this.playerId, message[1], message[2]));
                    break;
                case Types.Messages.LOOTMOVE:
                    this._dispatch(this.world.handleLootMove(this.playerId, message[1], message[2], message[3]));
                    break;
                case Types.Messages.AGGRO:
                    this._dispatch(this.world.handleAggro(message[1]));
                    break;
                case Types.Messages.ATTACK:
                    this._dispatch(this.world.handleAttack(this.playerId, message[1]));
                    break;
                case Types.Messages.HIT:
                    this._dispatch(this.world.handleHit(this.playerId, message[1]));
                    break;
                case Types.Messages.HURT:
                    this._dispatch(this.world.handleHurt(message[1]));
                    break;
                case Types.Messages.LOOT:
                    this._dispatch(this.world.handleLoot(this.playerId, message[1]));
                    break;
                case Types.Messages.TELEPORT:
                    this._dispatch(this.world.handleTeleport(this.playerId, message[1], message[2]));
                    break;
                case Types.Messages.ZONE:
                    this._dispatch(this.world.handleZone(this.playerId));
                    break;
                case Types.Messages.CHAT:
                    this._dispatch(this.world.handleChat(this.playerId, message[1]));
                    break;
                case Types.Messages.OPEN:
                    this._dispatch(this.world.handleOpen(this.playerId, message[1]));
                    break;
                case Types.Messages.CHECK:
                    this._dispatch(this.world.handleCheck(message[1]));
                    break;
                default:
                    log.debug('LocalGameClient: unhandled message ' + action);
            }
        },

        _handleHello: function(message) {
            var payload = this.world.handleHello(message[1], message[2], message[3]);
            this.playerId = payload.id;

            this._dispatch([[Types.Messages.WELCOME, payload.id, payload.name, payload.x, payload.y, payload.hp],
                            [Types.Messages.POPULATION, payload.worldPopulation, payload.totalPopulation]]);

            var list = payload.entityIds.slice(0);
            list.unshift(Types.Messages.LIST);
            this._dispatch([list]);
        },

        _dispatch: function(messages) {
            var self = this;

            if(!messages) {
                return;
            }
            if(messages.length && messages[0] && !(messages[0] instanceof Array)) {
                messages = [messages];
            }

            _.each(messages, function(packet) {
                if(packet && packet.length) {
                    self.receiveAction(packet);
                }
            });
        }
    });

    return LocalGameClient;
});
