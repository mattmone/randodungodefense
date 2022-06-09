import { initScene } from "../../utils/initScene.js";
import { AnimationMixer, Clock } from "../../libs/three.module.js";
import { GLTFLoader } from "../../libs/GLTFLoader.js";
// import {
//   DRACOLoader
// } from "../../libs/DRACOLoader.js";

export class Avatar extends EventTarget {
	#colorOffset = {};
	#currentAnimation = "idle";

	imageSize = 256;
	#canvas = new OffscreenCanvas(this.imageSize, this.imageSize);
	#scene;
	#camera;
	#renderer;
	#_rendered = false;

	constructor({ colorOffset = {}, placeholder = "", image = "" }) {
		super();
		({
			scene: this.#scene,
			camera: this.#camera,
			renderer: this.#renderer,
		} = initScene(this.#canvas, { alpha: true }));
		this.#camera.position.set(24, 24, 24);
		this.renderAvatar({ colorOffset });

		this.#colorOffset = colorOffset;
	}

	get serialized() {
		return this.#colorOffset;
	}

	get image() {
		return new Promise(async (resolve) => {
			await this.render();
			resolve(this.#canvas.transferToImageBitmap());
		});
	}

	get ready() {
		if (this.#rendered) return Promise.resolve();
		return new Promise((resolve) => {
			this.addEventListener("rendered", resolve);
		});
	}

	get #rendered() {
		return this.#_rendered;
	}

	set #rendered(value) {
		this.#_rendered = value;
		this.dispatchEvent(new CustomEvent("rendered"));
	}

	get rendered() {
		return this.#rendered;
	}

	get canvas() {
		return this.#canvas;
	}

	/**
	 * swap the avatar's current animation with another named animation
	 * @param {string} newAnimation the name of the animation action to play
	 * @param {SwapAnimationOptions} options the options for the animation swap
	 * @returns {Avatar} this
	 */
	swapAnimation(newAnimation, options = {}) {
		if (this.#currentAnimation === newAnimation) return;
		this.mesh.userData.animations.actions[newAnimation].clampWhenFinished =
			options.clamp;
		this.mesh.userData.animations.actions[newAnimation]
			.reset()
			.setLoop(options.loop)
			.setEffectiveWeight(1)
			.crossFadeFrom(
				this.mesh.userData.animations.actions[this.#currentAnimation],
				options.duration ?? 0.4,
				true
			)
			.play();
		this.#currentAnimation = newAnimation;
		const finishPromise = new Promise((resolve) => {
			this.mesh.userData.animations.mixer.addEventListener(
				"finished",
				(event) => {
					console.log("finished");
					if (options.onFinish) options.onFinish();
					resolve(this);
				},
				{ once: true }
			);
		});
		if (!options.await) return this;
		if (options.await === "finish") return finishPromise;
		else
			return new Promise(async (resolve) => {
				const { duration } =
					this.mesh.userData.animations.actions[newAnimation].getClip();
				setTimeout(() => {
					resolve(this);
				}, duration * 1000 * options.await);
			});
	}

	/**
	 *
	 * @param {Object} AvatarRenderParams
	 * @param {import("../character.js").AvatarColorOffset} AvatarRenderParams.colorOffset
	 * @returns
	 */
	async renderAvatar({ colorOffset = {} }) {
		const loader = new GLTFLoader();
		// const dracoLoader = new DRACOLoader();
		// dracoLoader.setDecoderPath("/libs/draco/gltf/");
		// loader.setDRACOLoader(dracoLoader);

		this.mesh = await new Promise((resolve, reject) => {
			loader.load(
				// resource URL
				"../models/vox-character.glb",
				// called when the resource is loaded
				function (gltf) {
					gltf.scene.traverse((object) => {
						if (object.isMesh) {
							Object.keys(colorOffset).forEach((key) => {
								if (
									object.material.name.includes(key) ||
									(key === "hands" && object.material.name.includes("ring"))
								) {
									const { h, s, l } = colorOffset[key];
									if (colorOffset[key].set)
										object.material.color.setHSL(h, s, l);
									else object.material.color.offsetHSL(h, s, l);
								}
							});
						}
					});

					const { animations } = gltf;

					const mixer = new AnimationMixer(gltf.scene);

					const actions = Object.fromEntries(
						animations.map((animationClip) => {
							return [animationClip.name, mixer.clipAction(animationClip)];
						})
					);

					Object.values(actions).forEach((action) => {
						action.enabled = true;
						action.setEffectiveTimeScale(1);
						action.setEffectiveWeight(0);
						action.play();
					});
					actions.idle.setEffectiveWeight(1);
					gltf.scene.userData.animations = {
						mixer,
						actions,
						clock: new Clock(),
					};

					resolve(gltf.scene);
					// gltf.animations; // Array<THREE.AnimationClip>
					// gltf.scene; // THREE.Group
					// gltf.scenes; // Array<THREE.Group>
					// gltf.cameras; // Array<THREE.Camera>
					// gltf.asset; // Object
				},
				// called while loading is progressing
				function (xhr) {
					console.log((xhr.loaded / xhr.total) * 100 + "% loaded");
				},
				// called when loading has errors
				function (error) {
					reject(error);
					console.log("An error happened", error);
				}
			);
		});

		// const model = new Mesh(
		//   new BoxGeometry(0.5, 1, 0.5),
		//   new MeshStandardMaterial({ color: color.hex }),
		// );
		this.mesh.userData.type = "avatar";
		const scale = 4;
		this.mesh.scale.set(scale, scale, scale);
		this.mesh.position.setY(-60);
		this.#scene.add(this.mesh);
		this.#camera.lookAt(this.#scene.position);
		this.#camera.updateProjectionMatrix();
		return this.render(this.mesh);
	}

	async render(model = this.mesh) {
		return new Promise(async (resolve) => {
			this.#renderer.render(this.#scene, this.#camera);
			model.userData.animations.mixer.update(
				model.userData.animations.clock.getDelta()
			);
			this.#rendered = true;
			resolve(model);
		});
	}
}

/**
 * @typedef {Object} SwapAnimationOptions
 * @property {number} [duration=0.4] the duration of the animation swap crossfade
 * @property {LoopRepeat|LoopOnce} [loop=LoopRepeat] whether the animation should loop LoopOnce or LoopRepeat
 * @property {boolean} [clamp=false] whether the animation should clamp when finished (pause on last frame)
 * @property {number|string} [await] the percentage of the new animation duration to wait before resolving the promise or 'finish' to wait for the end
 * @property {Function} [onFinish] a callback to run when the animation finishes
 */
