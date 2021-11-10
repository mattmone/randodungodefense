import {
  Scene,
  OrthographicCamera,
  WebGLRenderer,
  DirectionalLight,
  Mesh,
  BoxGeometry,
  MeshStandardMaterial,
} from '../../libs/three.module.js';

class ModelRenderer {
  #canvas = new OffscreenCanvas(128, 128);
  #scene = new Scene();
  #camera = new OrthographicCamera(-1, 1, 1, -1, 1, 10);
  #renderer = new WebGLRenderer({ antialias: true, canvas: this.#canvas, alpha: true });
  #light = new DirectionalLight(0xffffff, 1);
  #processing = [];

  constructor() {
    this.#camera.position.set(1, 1, 1);
    this.#camera.lookAt(0, 0, 0);
    this.#camera.updateProjectionMatrix();

    this.#light.position.set(2, 2, 2);
    this.#scene.add(this.#light);

    this.#renderer.setClearColor(0x000000, 0);
    this.#renderer.setSize(this.#canvas.width, this.#canvas.height, false);
  }

  async renderAvatar({ color }) {
    const model = new Mesh(
      new BoxGeometry(0.5, 1, 0.5),
      new MeshStandardMaterial({ color: color.hex }),
    );
    model.userData.type = 'avatar';
    return this.render(model);
  }

  async render(model) {
    const processing = [...this.#processing];
    const promise = new Promise(async resolve => {
      await Promise.allSettled(processing);
      this.#scene.add(model);
      this.#renderer.render(this.#scene, this.#camera);
      const imageBlob = await this.#canvas.convertToBlob();
      const image = URL.createObjectURL(imageBlob);
      resolve({ model, image });
      this.#scene.remove(model);
      this.#processing.shift();
    });
    this.#processing.push(promise);
    return promise;
  }
}

export const modelRenderer = new ModelRenderer();
