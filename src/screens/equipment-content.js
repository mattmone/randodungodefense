import { LitElement, html, css } from 'lit-element';
import { buttonStyles } from 'styles/button.styles.js';

const mappings = {
  'primary hand': ['weapon'],
  'secondary hand': ['weapon', 'shield'],
  feet: ['boots'],
  fingers: ['ring'],
};
class EquipmentContent extends LitElement {
  static get styles() {
    return [
      buttonStyles,
      css`
        #equipment-locations {
          display: flex;
          flex-direction: column;
          padding: 0 8px;
          gap: 8px;
          margin-top: 4px;
          overflow: auto;
        }
        button[equipped] {
          color: var(--accent-color);
          border-color: var(--accent-color);
        }
        button[equipped]:after {
          content: ' ';
          position: absolute;
          top: -8px;
          right: -8px;
          height: 16px;
          width: 16px;
          border-radius: 50%;
          border: 1px solid var(--accent-color);
          background: var(--circle-fill);
          pointer-events: none;
        }
      `,
    ];
  }

  static get properties() {
    return {
      itemLocation: String,
      selectedCatgory: String,
      detailItem: Object,
      items: Array,
      character: Object,
    };
  }

  constructor() {
    super();
    this.selectedEquipment = [];
    this.itemLocation = '';
  }

  get equippedItems() {
    return Object.values(this.character.equipment);
  }

  showEquipment(category) {
    this.selectedCatgory = category;
    this.itemLocation = mappings[category] || [category];
    this.shadowRoot.querySelector('#equipment').toggleAttribute('open');
  }

  showDetail(item) {
    return async () => {
      await import('./detail-content.js');
      this.detailItem = item;
      this.shadowRoot.querySelector('#details').toggleAttribute('open');
    };
  }

  equip({ detail: item }) {
    this.character.equipment[this.selectedCatgory] = this.items.splice(
      this.items.indexOf(item),
      1,
    )[0];
    this.requestUpdate();
  }

  render() {
    return html`<slot></slot>
      <side-screen id="equipment">
        <div id="equipment-locations">
          ${this.equippedItems
            ?.filter(
              item =>
                this.itemLocation.includes(item.type) || this.itemLocation.includes(item.slot),
            )
            .map(
              item =>
                html` <button equipped @click=${this.showDetail(item)}>${item.name}</button> `,
            )}
          ${this.items
            ?.filter(
              item =>
                this.itemLocation.includes(item.type) || this.itemLocation.includes(item.slot),
            )
            .map(item => html` <button @click=${this.showDetail(item)}>${item.name}</button> `)}
        </div>
        <side-screen id="details">
          <detail-content
            ?equipped=${this.equippedItems.includes(this.detailItem)}
            @equip-item=${this.equip}
            .item=${this.detailItem}
          ></detail-content>
        </side-screen>
      </side-screen>`;
  }
}
customElements.define('equipment-content', EquipmentContent);
