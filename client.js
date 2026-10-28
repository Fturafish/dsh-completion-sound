/**
 * Client half of the completion-chime bundle.
 *
 * Plays one short, quiet two-note chime when a Session stops running — either the
 * Session on screen or one that finished in the background. The signal is the
 * standard `useSessionStatus` hook that ui-session publishes to every Slot entry:
 * `running` flips `true` → `false` when a turn closes, and `completionUnread` turns
 * `true` for a background Session that finished while another one was on screen.
 */
window.__ModuleLoader__.load({
  id: '@local/dsh-completion-sound',
  factory(require) {
    const React = require('react');

    /** Ignore a second chime that lands immediately after the first one. */
    const COOLDOWN_MS = 900;
    /** A quiet rising fifth (A5 → E6); 0.45 s in total. */
    const NOTES = [
      { at: 0, frequency: 880 },
      { at: 0.11, frequency: 1318.51 },
    ];

    /**
     * One lazily created Web Audio chime.
     * The context is created on the browser's first user gesture, which is also what
     * lets it start in the `running` state under autoplay policies; a completion that
     * arrives before that gesture is kept queued and played on unlock.
     */
    function createChime() {
      let audio = null;
      let queued = false;
      let lastPlayedAt = 0;

      function ensure() {
        if (audio !== null) return audio;
        const Ctor = window.AudioContext || window.webkitAudioContext;
        if (!Ctor) return null;
        try {
          audio = new Ctor();
        } catch (error) {
          audio = null;
        }
        return audio;
      }

      function render(context) {
        const start = context.currentTime + 0.01;
        for (const note of NOTES) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const at = start + note.at;
          oscillator.type = 'sine';
          oscillator.frequency.setValueAtTime(note.frequency, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.exponentialRampToValueAtTime(0.16, at + 0.015);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.42);
          oscillator.connect(gain);
          gain.connect(context.destination);
          oscillator.start(at);
          oscillator.stop(at + 0.45);
        }
      }

      function flush() {
        if (!queued || audio === null || audio.state !== 'running') return false;
        queued = false;
        lastPlayedAt = Date.now();
        render(audio);
        return true;
      }

      function play() {
        const now = Date.now();
        if (now - lastPlayedAt < COOLDOWN_MS) return false;
        const context = ensure();
        if (context === null) return false;
        if (context.state === 'running') {
          lastPlayedAt = now;
          render(context);
          return true;
        }
        queued = true;
        context.resume().then(flush).catch(() => {});
        return false;
      }

      /** Wake the context on the first gesture and play anything the page owed. */
      function install() {
        const wake = () => {
          const context = ensure();
          if (context === null) return;
          if (context.state === 'running') {
            flush();
            return;
          }
          context.resume().then(flush).catch(() => {});
        };
        const options = { capture: true, passive: true };
        window.addEventListener('pointerdown', wake, options);
        window.addEventListener('keydown', wake, options);
        window.addEventListener('touchstart', wake, options);
        return () => {
          window.removeEventListener('pointerdown', wake, options);
          window.removeEventListener('keydown', wake, options);
          window.removeEventListener('touchstart', wake, options);
        };
      }

      function state() {
        return {
          context: audio === null ? 'absent' : audio.state,
          queued,
          lastPlayedAt,
        };
      }

      return { play, install, state };
    }

    const chime = createChime();
    let warned = false;
    let previous = null;

    /**
     * Headless entry in the frame-wide overlay: it renders nothing and only watches
     * the Session status map, so the sound fires wherever the user is in the app.
     */
    function CompletionWatcher(props) {
      const readStatus = props.useSessionStatus;
      const readable = typeof readStatus === 'function';
      const status = readable ? readStatus((map) => map) : undefined;

      React.useEffect(() => {
        if (!readable) {
          if (!warned) {
            warned = true;
            console.warn('[completion-sound] useSessionStatus is unavailable; no chime will play.');
          }
          return;
        }
        if (!status || typeof status.forEach !== 'function') return;
        const next = new Map();
        const finished = [];
        status.forEach((entry, sessionId) => {
          if (!entry || typeof entry !== 'object') return;
          next.set(sessionId, {
            running: entry.running,
            completionUnread: entry.completionUnread,
          });
          if (previous === null) return;
          const before = previous.get(sessionId);
          if (before === undefined) return;
          if (before.running === true && entry.running === false) finished.push(sessionId);
          else if (before.completionUnread !== true && entry.completionUnread === true) finished.push(sessionId);
        });
        previous = next;
        if (finished.length === 0) return;
        chime.play();
      }, [status, readable]);

      return null;
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.effect(() => chime.install(), 'completion-sound: unlock audio on the first gesture');
        window.__dshCompletionSound = {
          play: () => chime.play(),
          state: () => chime.state(),
        };
        ctx.slots.inject('shell.overlay', () => ctx.slots.register({
          name: 'shell.overlay',
          id: 'completion-sound',
          order: 40,
          label: 'Completion chime',
        }, CompletionWatcher));
      },
    };
  },
});
