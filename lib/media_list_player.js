var EventEmitter = require('events').EventEmitter;

var ref = require('ref');
var ffi = require('ffi');

var lib = require('./libvlc');
var EventPtr = require('./libvlc_types').EventPtr;
var util = require('./util');

var Media = require('./media');
var Video = require('./video');
var Audio = require('./audio');
var _util = require('util');

var properties = {
    is_playing: {},
    is_seekable: {},
    will_play: {},
    can_pause: {},
    state: {get: true},
    length: {get: true},
    fps: {get: true},
    chapter_count: {get: true},
    title_count: {get: true},
    time: {get: true, set: true},
    position: {get: true, set: true},
    chapter: {get: true, set: true},
    title: {get: true, set: true},
    rate: {get: true, set: true}
};

var VALID_EVENTS = {
    0x100: 'MediaChanged',
    0x101: 'NothingSpecial',
    0x102: 'Opening',
    0x103: 'Buffering',
    0x104: 'Playing',
    0x105: 'Paused',
    0x106: 'Stopped',
    0x107: 'Forward',
    0x108: 'Backward',
    0x109: 'EndReached',
    0x10A: 'EncounteredError',
    0x10B: 'TimeChanged',
    0x10C: 'PositionChanged',
    0x10D: 'SeekableChanged',
    0x10E: 'PausableChanged',
    0x10F: 'TitleChanged',
    0x110: 'SnapshotTaken',
    0x111: 'LengthChanged',
    0x112: 'Vout',
    1026:'MediaListPlayerStopped',
    1024:'MediaListPlayerPlayed',
    1025:'MediaListPlayerNextItemSet',
    MediaChanged: 0x100,
    NothingSpecial: 0x101,
    Opening: 0x102,
    Buffering: 0x103,
    Playing: 0x104,
    Paused: 0x105,
    Stopped: 0x106,
    Forward: 0x107,
    Backward: 0x108,
    EndReached: 0x109,
    EncounteredError: 0x10A,
    TimeChanged: 0x10B,
    PositionChanged: 0x10C,
    SeekableChanged: 0x10D,
    PausableChanged: 0x10E,
    TitleChanged: 0x10F,
    SnapshotTaken: 0x110,
    LengthChanged: 0x111,
    Vout: 0x112,
    MediaListPlayerStopped:1026,
    MediaListPlayerPlayed:1024,
    MediaListPlayerNextItemSet:1025
};

var event_handler = function (e, d) {


    var event = e.deref();
    var obj = d.deref();
    var union = event.u;
    var name, arg;

    if (obj.instance.address() != event.p_obj.address())
        return;

    name = VALID_EVENTS[event.type];

    if (!name)
        return;

    console.log('event handler ' + name,arguments);

    switch (event.type) {
        case 1026:
            console.error('is stopped');
            break;
        case 1024:
            console.error('is played');
            break;
        case 1025:
            console.error('set next');
            break;
        case 0x103:
            arg = union.media_player_buffering.new_cache;
            break;
        case 0x10B:
            arg = union.media_player_time_changed.new_time;
            break;
        case 0x10C:
            arg = union.media_player_position_changed.new_position;
            break;
        case 0x10D:
            arg = union.media_player_seekable_changed.new_seekable;
            break;
        case 0x10E:
            arg = union.media_player_pausable_changed.new_pausable;
            break;
        case 0x10F:
            arg = union.media_player_title_changed.new_title;
            break;
        case 0x112:
            arg = union.media_player_vout.new_count;
            break;
    }

    console.log('media player event ' +name,arg);

    obj.emit(name, arg);


};

var eventcb = ffi.Callback(ref.types.void, [
    EventPtr,
    ref.refType(ref.types.Object)
], event_handler);

var MediaListPlayer = module.exports = function (parent) {
    var self = this;
    var released = false;
    var eventmgr;
    var selfref = ref.alloc(ref.types.Object, self);
    this.parent = parent;

    this.instance = lib.libvlc_media_list_player_new(parent);

    this.release = function () {
        if (!released) {
            lib.libvlc_media_list_player_release(self.instance);
            released = true;
        }
    };
    util.makeProperties(self, self.instance, properties, 'libvlc_media_list_player_');

    Object.defineProperty(this, 'list', {
        get: function () {
            return self._list;
        },
        set: function (val) {
            self._list = val;
            var ret = lib.libvlc_media_list_player_set_media_list(self.instance, val.instance);
            console.error('set list ' + val.count(),ret);
        }
    });
    
    this.play = function () {
        var ret = lib.libvlc_media_list_player_play(self.instance);
        return ret < 0 ? util.throw() : true;
    };

    /*
    this.getPlayer = function () {
        var ret = lib.libvlc_media_list_player_get_media_player(self.instance);
        return ret < 0 ? util.throw() : true;
    };
    */

    this.pause = function () {
        lib.libvlc_media_list_player_pause(self.instance);
    };

    this.next = function () {
        lib.libvlc_media_list_player_next(self.instance);
    };

    this.prev = function () {
        lib.libvlc_media_list_player_previous(self.instance);
    };

    this.stop = function () {
        lib.libvlc_media_list_player_stop(self.instance);
    };

    var _on = this.on;
    this.on = function (e, cb) {
        var tmp;
        if (!eventmgr) {
            eventmgr = lib.libvlc_media_list_player_event_manager(self.instance);
        }
        console.error('add event ' + e + ' :  ' + VALID_EVENTS[e]);

        if (VALID_EVENTS[e] !== undefined) {
            if (!self._events || !self._events[e]) {
                tmp = lib.libvlc_event_attach(eventmgr, VALID_EVENTS[e], eventcb, selfref);
                if (tmp != 0) util.throw();
            }
            _on.call(self, e, cb);
        } else {
            throw new Error("Not a valid event type: " + e + " not in " + Object.keys(VALID_EVENTS),e);
        }
    };

    var _rl = this.removeListener;
    this.removeListener = function (e, cb) {
        if (!eventmgr)
            return;
        if (VALID_EVENTS[e] !== undefined) {
            if (self._events && ((self._events[e] instanceof Function) || self._events[e].length === 1)) {
                lib.libvlc_event_detach(eventmgr, VALID_EVENTS[e], eventcb, selfref);
            }
            _rl.call(self, e, cb);
        } else {
            throw new Error("Not a valid event type: " + e + " not in " + Object.keys(VALID_EVENTS));
        }
    };
};
require('util').inherits(MediaListPlayer, EventEmitter);
