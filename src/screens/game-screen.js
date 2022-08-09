import { LitElement, html, css } from 'lit-element';
import { buttonStyles } from 'styles/button.styles.js';
import { commonStyles } from 'styles/common.styles.js';
import { wrap, transfer } from 'comlink';

class GameScreen extends LitElement {
  static get styles() {
    return [
      commonStyles,
      buttonStyles,
      css`
        #commence {
          position: fixed;
          bottom: 1em;
          left: 50%;
          transform: translateX(-50%);
          padding: 8px 16px;
        }
        #notifier {
          opacity: 0;
          position: fixed;
          top: 0;
          left: 0;
          color: white;
          font-family: VT323;
          pointer-events: none;
        }
        #notifier[open] {
          opacity: 1;
        }
      `,
    ];
  }

  static get properties() {
    return {
      screenWidth: { type: Number },
      screenHeight: { type: Number },
      commenceActive: { type: Boolean, state: true },
      commenced: { type: Boolean, state: true },
      currentParticipant: { type: Object },
      moved: { type: Boolean },
      acted: { type: Boolean },
      notificationX: { type: Number },
      notificationY: { type: Number },
      message: { type: String },
      notificationOpen: { type: Boolean },
    };
  }

  get gameMapLoaded() {
    return new Promise(resolve => {
      const interval = setInterval(() => {
        if (this.gameMap) {
          clearInterval(interval);
          resolve();
        }
      }, 16);
    });
  }

  constructor() {
    super();
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;
    this.rotation = {};
    this.notificationX = 0;
    this.notificationY = 0;
  }

  async firstUpdated() {
    const canvas = this.shadowRoot.querySelector('canvas');

    const offscreen = canvas.transferControlToOffscreen();
    const GameMap = wrap(
      new Worker('./workers/game-screen.worker.js', {
        type: 'module',
      }),
    );
    /**
     * @type {GameMap}
     */
    this.gameMap = await new GameMap(transfer({ canvas: offscreen }, [offscreen]));
    this.resizeObserver = new ResizeObserver(() => {
      this.gameMap.setSize(window.innerWidth, window.innerHeight);
    });
    this.resizeObserver.observe(this);
  }

  async generateMaps(mapTypes) {
    await Promise.all(mapTypes.map(type => this.gameMap.generateMap({ type })));
  }

  async selectMap(mapIndex, mapType) {
    this.gameMap.entryMap(mapIndex, mapType);
    this.mapIndex = mapIndex;
    this.mapType = mapType;
  }

  pointerDown({ x, y }) {
    this.rotation.start = { x, y };
    this._pointerDown = new Date();
    if (this.rotation?.delta) {
      this.rotation.start.x -= this.rotation.delta.dx;
    }
  }

  pointerMove(event) {
    const { buttons, x, y } = event;
    this.gameMap.mouseOver({ x, y });
    if (buttons === 1) {
      event.preventDefault();
      const dx = -(this.rotation.start.x - x);
      if (Math.abs(dx) > 10) this._moving = true;
      this.rotation.delta = { dx };
      this.gameMap.setRotation(this.rotation.delta);
    }
  }

  pointerUp() {
    if (new Date() - this._pointerDown > 100) this.nonClick = true;
  }

  async chooseCharacter() {
    return new Promise(async (resolve, reject) => {
      await import('./character-selection.js');
      const characterSelection = this.shadowRoot.querySelector('character-selection');
      
      characterSelection.characters = await this.gameMap.selectableCharacters();
      characterSelection.show();
      const selectionAbort = new AbortController();
      characterSelection.addEventListener('character-selected', ({ detail: characterIndex }) => {
        characterSelection.hide();
        resolve(characterIndex);
        this.commenceActive = true;
        selectionAbort.abort();
      }, { signal: selectionAbort.signal });
      characterSelection.addEventListener('selection-cancelled', () => {
        characterSelection.hide();
        reject();
        selectionAbort.abort();
      }, {signal: selectionAbort.signal});
    });
  }

  async canvasClick({ x, y }) {
    if (this.nonClick || this._processingClick) return (this.nonClick = false);
    this._processingClick = true;
    const { clickPosition, childCount, endPhase, damage, position, loot } = await this.gameMap.mapClick({
      x,
      y,
    });
    this._processingClick = false;
    if (!this.commenced) {
      if (childCount) return this.gameMap.removeChildren();
      const characterIndex = await this.chooseCharacter().catch(() => null);
      if (characterIndex !== null) this.gameMap.placeCharacter({ characterIndex });
      return;
    }
    if (endPhase === 'move') this.moved = true;
    if (endPhase === 'action') {
      this.acted = true;
      this.message = damage;
      this.notificationX = position.x;
      this.notificationY = position.y;
      this.notificationOpen = true;
      setTimeout(() => {
        this.notificationOpen = false;
      }, 1500);
    }
    if(endPhase === 'win') {
      alert('You win!');
      this.dispatchEvent(new CustomEvent('game-win', { detail: { loot } }));
    }
  }

  async commence() {
    await this.gameMap.loadMap(this.mapIndex, this.mapType);
    delete this.mapIndex;
    delete this.mapType;
    this.commenced = true;
    this.currentParticipant = await this.gameMap.startBattle();
    await import('./current-turn.js');
    this.currentTurnScreen = this.shadowRoot.querySelector('current-turn');
    this.currentTurnScreen.toggleAttribute('hidden', false);
  }

  async startMove() {
    this.gameMap?.initiateMove();
  }

  async waitTurn() {
    this.currentParticipant = await this.gameMap.endTurn();
    this.moved = false;
    this.acted = false;
  }

  async playerAttack() {
    this.gameMap?.initiateAttack();
  }

  render() {
    return html`<canvas
        id="render"
        width=${this.screenWidth}
        height=${this.screenHeight}
        @pointerdown=${this.pointerDown}
        @pointermove=${this.pointerMove}
        @pointerup=${this.pointerUp}
        @click=${this.canvasClick}
      ></canvas>
      <character-selection hidden></character-selection>
      <current-turn
        hidden
        .currentParticipant=${this.currentParticipant}
        .moved=${this.moved}
        .acted=${this.acted}
        @start-move=${this.startMove}
        @wait-turn=${this.waitTurn}
        @player-attack=${this.playerAttack}
      ></current-turn>
      <button
        id="commence"
        ?hidden=${this.commenced}
        ?disabled=${!this.commenceActive}
        @click=${this.commence}
      >
        Commence
      </button>
      <div
        id="notifier"
        ?open=${this.notificationOpen}
        style="transform:translate(${this.notificationX}px, ${this.notificationY}px);"
      >
        ${this.message}
      </div>`;
  }
}
customElements.define('game-screen', GameScreen);
