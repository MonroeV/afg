// Someone asked your bodyguards to let them in: who, and four big buttons. ✅📋 on the guest list
// for good, 🚪⏰ just this visit, ❌ no, 🔕 stop asking me. (It goes away by itself if you don't
// answer in time.)
export class GuardAsk {
  constructor({ onAnswer, onClose }) {
    Object.assign(this, { onAnswer, onClose });
    this.el = document.createElement('div');
    this.el.id = 'guard-ask';
    this.el.className = 'screen hidden';
    this.el.innerHTML = `<div class="panel game-panel guard-panel">
      <h2 class="guard-title"></h2>
      <div class="guard-time"><div></div></div>
      <div class="guard-choices">
        <button data-answer="list" title="Put them on the guest list"><span class="big">✅</span>📋</button>
        <button data-answer="visit" title="Just this visit"><span class="big">🚪</span>⏰</button>
        <button data-answer="no" title="No"><span class="big">❌</span></button>
        <button data-answer="block" class="secondary" title="Stop asking me"><span class="big">🔕</span></button>
      </div>
    </div>`;
    document.body.append(this.el);
    for (const b of this.el.querySelectorAll('[data-answer]')) {
      b.addEventListener('click', () => {
        const id = this.id;
        this.close();
        this.onAnswer(id, b.dataset.answer);
      });
    }
  }

  get open() {
    return !this.el.classList.contains('hidden');
  }

  show({ id, from, seconds }) {
    this.id = id;
    this.el.querySelector('.guard-title').textContent = `🛡️🔔 ${from} 🚪❓`;
    const bar = this.el.querySelector('.guard-time div');
    bar.style.animation = 'none';
    void bar.offsetWidth; // (start the countdown again)
    bar.style.animation = `guard-time ${seconds}s linear forwards`;
    this.el.classList.remove('hidden');
  }

  // Closed (answered, or the time ran out). id: only if it's still this request.
  close(id = this.id) {
    if (!this.open || id !== this.id) return;
    this.el.classList.add('hidden');
    this.onClose();
  }
}
