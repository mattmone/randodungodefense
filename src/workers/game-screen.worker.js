import { expose } from "../../libs/comlink.min.js";
import {
	BoxGeometry,
	MeshStandardMaterial,
	MeshBasicMaterial,
	Mesh,
	Group,
	Vector2,
	Vector3,
	CanvasTexture,
	Raycaster,
	AnimationMixer,
	VectorKeyframeTrack,
	QuaternionKeyframeTrack,
	AnimationClip,
	Clock,
	Object3D,
	Quaternion,
	LoopOnce,
	InterpolateDiscrete,
	InterpolateLinear,
	InterpolateSmooth
} from "../../libs/three.module.js";

import { makeMap } from "../utils/makeMap.js";
import { createTerrainSide } from "../utils/createTerrainSide.js";
import { rollDice } from "../utils/rollDice.js";
import { oneOf } from "../utils/oneOf.js";
import { Character } from "../character.js";
import { Crew } from "../services/crew.js";
import { initScene } from "../utils/initScene.js";

const characters = new Crew();

const enemies = new Crew("enemy");
if (enemies.members.length > 0) enemies.disband();
enemies.random({ quantity: 5, level: 2, withEquipment: true });

Promise.all([characters.initialized, enemies.initialized]).then(() => {
	[...characters.members, ...enemies.members].forEach(async character => {
		character.avatar.renderAvatar({meshInit: true});
		await character.avatar.initialized;
		const scale = 0.04;
		character.avatar.mesh.scale.set(scale, scale, scale);
	});
});

const enemyPosition = (tile) => {
	return enemies.members.some((enemy) => enemy.tile === tile);
};

const positionEquals = (position1, position2) => {
	return position1?.x === position2?.x && position1?.z === position2?.z;
};

const sameTeam = (char1, char2) => {
	return (
		(characters.members.includes(char1) &&
			characters.members.includes(char2)) ||
		(enemies.members.includes(char1) && enemies.members.includes(char2))
	);
};

const copyVector = (vector) => {
	return new Vector3(...vector.toArray());
};

function turnSort(participant1, participant2) {
	let sort = 0;
	if (
		participant1.stats.get("dexterity").level <
		participant2.stats.get("dexterity").level
	)
		sort = 1;
	if (
		participant1.stats.get("dexterity").level >
		participant2.stats.get("dexterity").level
	)
		sort = -1;
	if (
		participant1.stats.get("speed").level <
		participant2.stats.get("speed").level
	)
		sort = 1;
	if (
		participant1.stats.get("speed").level >
		participant2.stats.get("speed").level
	)
		sort = -1;
	if (participant1.nextMove > participant2.nextMove) sort = 1;
	if (participant1.nextMove < participant2.nextMove) sort = -1;
	return sort;
}
/** Class representing the game map */
class GameMap extends EventTarget{
	
	/**
	 * @type {Character[]}
	 */
	placedCharacters = new Crew('placed', true);
	/**
	 * @type {Group[]}
	 */
	maps = [];
	/**
	 * @type {Group[]}
	 */
	#renderedMaps = [];
	/**
	 * @type {Group[]}
	 */
	#entryMaps = [];
	/**
	 * @type {Mesh[]}
	 */
	animationsObjects = [];

	/**
	 * @type {Mesh[]}
	 */
	characterAnimations = [];

	interactible = [];

	/**
	 * instantiate the GameMap
	 * @param {Object} params the game scene
	 */
	constructor({ canvas }) {
		super();
		/**
		 * @type {Canvas}
		 */
		this.canvas = canvas;
		({
			scene: this.scene,
			camera: this.camera,
			renderer: this.renderer,
			aspect: this.aspect,
			directionalLight: this.directionalLight,
			ambientLight: this.ambientLight,
		} = initScene(canvas));

		this.raycaster = new Raycaster();
		this.mousePosition = new Vector2();

		this.focalPoint = new Object3D();
		this.scene.add(this.focalPoint);

		this.render();
		return this;
	}

	get renderedMaps() {
		return this.#renderedMaps;
	}

	set renderedMaps(value) {
		this.#renderedMaps = value;
		console.log('renderedMaps', value);
		this.dispatchEvent(new CustomEvent("map-rendered", { detail: value }));
	}

	get entryMaps() {
		return this.#entryMaps;
	}

	set entryMaps(value) {
		this.#entryMaps = value;
		console.log('entryMaps', value);
		this.dispatchEvent(new CustomEvent("entry-map-rendered", { detail: value }));
	}

	setSize(width, height) {
		this.canvas.width = width;
		this.canvas.height = height;
		this.aspect = width / height;
		const d = 30;

		this.camera.left = -d * this.aspect;
		this.camera.right = d * this.aspect;
		this.camera.top = d;
		this.camera.bottom = -d;
		this.camera.near = 0;
		this.camera.far = 60;
		this.camera.updateProjectionMatrix();
	}

	setRotation({ dx }) {
		this.rotation = { dx: dx / 50 };
	}

	selectableCharacters() {
		return characters.members.filter(({dead}) => !dead).map(({ id }) => id);
	}

	generateMap({ type = "largeRoad", width = 36, height = 18 }) {
		const map = makeMap({ type, width, height });
		this.maps.push(map);
		const mapName = `map-${crypto.randomUUID()}`;
		this.renderMap(map, { characterPlacement: true, mapName });
		this.renderMap(map, { mapName });
		return map;
	}

	async renderMap(map, { characterPlacement, mapName }) {
		const group = new Group();
		let xPosition = -map[0].length / 2;
		let zPosition = -map.length / 2;

		for (let column of map) {
			for (let pixel of column) {
				if (characterPlacement && !pixel.entry) {
					xPosition += 1;
					continue;
				}
				const textureCanvas = createTerrainSide(
					characterPlacement ? "entry" : pixel.texture
				);
				const texture = new CanvasTexture(textureCanvas);

				const boxMaterial = new (
					pixel.texture === "water" ? MeshBasicMaterial : MeshStandardMaterial
				)({
					map: texture,
				});
				const cubeHeight =
					pixel.texture === "water" ? pixel.elevation : pixel.elevation + 0.5;
				const cube = new Mesh(new BoxGeometry(1, cubeHeight, 1), boxMaterial);
				cube.position.set(
					xPosition,
					0.5 *
						(pixel.texture === "water"
							? pixel.elevation - 0.5
							: pixel.elevation),
					zPosition
				);
				cube.userData = { ...pixel };
				const tileExtras = this.renderTileExtras({ ...pixel, cubeHeight });
				if (tileExtras.length) cube.add(...tileExtras);
				if (characterPlacement) cube.userData.type = "placement";
				group.add(cube);
				xPosition += 1;
			}
			zPosition += 1;
			xPosition = -map[0].length / 2;
		}
		group.name = mapName;
		if (characterPlacement) this.entryMaps = [...this.entryMaps, group];
		else this.renderedMaps = [...this.renderedMaps, group];
	}

	renderTileExtras({ tree, elevation, texture, rock, cubeHeight }) {
		const meshes = [];
		if (tree) {
			let layers = rollDice(4);
			const textureCanvas = createTerrainSide("stump");
			const texture = new CanvasTexture(textureCanvas);
			const stumpGeometry = new BoxGeometry(0.5, 1, 0.5);
			const stumpMaterial = new MeshStandardMaterial({ map: texture });
			const tree = new Mesh(stumpGeometry, stumpMaterial);
			tree.position.set(
				0,
				cubeHeight / 2 + stumpGeometry.parameters.height / 2,
				0
			);
			layers--;
			if (layers) {
				const treeLayers = layers * 2;
				for (let cubeIndex = treeLayers; cubeIndex > 0; cubeIndex--) {
					const size = cubeIndex / (treeLayers + 1) + 0.5;
					const treeGeometry = new BoxGeometry(size, 0.5, size);
					const textureCanvas =
						texture === "snow"
							? createTerrainSide("tree", { positiveZ: "snow" })
							: createTerrainSide("tree");
					let cubeImages = Array(6).fill(new CanvasTexture(textureCanvas));
					if (textureCanvas.positiveX)
						cubeImages = Object.values(textureCanvas).map(
							(canvas) => new CanvasTexture(canvas)
						);
					const treeMaterial = cubeImages.map(
						(canvasTexture) => new MeshStandardMaterial({ map: canvasTexture })
					);
					const leaves = new Mesh(treeGeometry, treeMaterial);
					leaves.position.set(
						0,
						stumpGeometry.parameters.height / 2 +
							((treeLayers - cubeIndex) * treeGeometry.parameters.height) /
								(!cubeIndex ? 2 : 1),
						0
					);
					tree.add(leaves);
				}
			}
			meshes.push(tree);
		}
		if (rock) {
			const textureCanvas =
				texture === "snow"
					? createTerrainSide("rock", { positiveZ: "snow" })
					: createTerrainSide("rock");
			let cubeImages = Array(6).fill(new CanvasTexture(textureCanvas));
			if (textureCanvas.positiveX)
				cubeImages = Object.values(textureCanvas).map(
					(canvas) => new CanvasTexture(canvas)
				);
			const rockMaterial = cubeImages.map(
				(canvasTexture) => new MeshStandardMaterial({ map: canvasTexture })
			);
			const rockGeometry = new BoxGeometry(0.9, 1, 0.9);
			const rockCube = new Mesh(rockGeometry, rockMaterial);
			rockCube.position.set(
				0,
				cubeHeight / 2 + rockGeometry.parameters.height / 2,
				0
			);
			meshes.push(rockCube);
		}
		return meshes;
	}

	mouseOver({ x, y }) {
		this.mousePosition.x = (x / this.canvas.width) * 2 - 1;
		this.mousePosition.y = -(y / this.canvas.height) * 2 + 1;
		this.determineIntersectionObject();
	}

	async mapClick({ x, y }) {
		this.mousePosition.x = (x / this.canvas.width) * 2 - 1;
		this.mousePosition.y = -(y / this.canvas.height) * 2 + 1;
		this.determineIntersectionObject();
		if (!this.intersectedObject) return;
		const clickPosition = { ...this.intersectedObject.position };
		const childCount = this.intersectedObject.children.length;

		let endPhase = false,
			damage,
			position,
			loot;
		if (this.phase === "move") endPhase = await this.move(clickPosition);
		if (this.phase === "action" && this.action === "attack") {
			[endPhase, damage, position] = await this.attack(clickPosition);
			// if all enemies are dead, move to 'win' phase
			if(enemies.allDead) {
				endPhase = 'win';
				loot = enemies.loot;
			}
		}

		return { clickPosition, loot, childCount, endPhase, damage, position };
	}

	async mapAvailable(index, entry) {
		const map = () => (entry ? this.entryMaps : this.renderedMaps)[index];
		if(map()) return Promise.resolve(map())
		return new Promise((resolve) => {
			const signal = new AbortController();
			this.addEventListener(`${entry ? 'entry-' : ''}map-rendered`, () => {
				if(!map()) return;
				resolve(map());
				signal.abort();
			}, { signal });
		});
	}

	async mapSelection() {
		return new Promise((resolve) => {
			resolve();
		});
	}

	async entryMap(index, mapType) {
		this.phase = "placement";
		await this.mapAvailable(index, true);
		this.map = this.entryMaps.splice(index, 1)[0];
		const maximalChildren = this.map.children.reduce(
			(accumulatedChild, child) => ({
				minX: Math.min(
					!isNaN(accumulatedChild.minX)
						? accumulatedChild.minX
						: accumulatedChild.position.x,
					child.position.x
				),
				minZ: Math.min(
					!isNaN(accumulatedChild.minZ)
						? accumulatedChild.minZ
						: accumulatedChild.position.z,
					child.position.z
				),
				maxX: Math.max(
					!isNaN(accumulatedChild.maxX)
						? accumulatedChild.maxX
						: accumulatedChild.position.x,
					child.position.x
				),
				maxZ: Math.max(
					!isNaN(accumulatedChild.maxZ)
						? accumulatedChild.maxZ
						: accumulatedChild.position.z,
					child.position.z
				),
			})
		);
		const [midX, midZ] = [
			(Math.max(maximalChildren.maxX, maximalChildren.minX) +
				Math.min(maximalChildren.maxX, maximalChildren.minX)) /
				2,
			(Math.max(maximalChildren.maxZ, maximalChildren.minZ) +
				Math.min(maximalChildren.maxZ, maximalChildren.minZ)) /
				2,
		];
		this.directionalLight.target = this.map;
		this.camera.zoom = 3;
		if (mapType === "mountain") {
			this.camera.zoom = 2;
			this.focalPoint.position.y = -3;
		}
		this.camera.position.set(-24, 24, -24);
		this.camera.lookAt(this.map.position);
		this.camera.updateProjectionMatrix();
		this.focalPoint.add(this.map);
		this.focus({ x: midX, y: 0, z: midZ });
		return this.mapSelection();
	}

	async loadMap(index, mapType) {
		this.phase = "firstTurn";
		await this.mapAvailable(index);
		await this.focus({ x: 0, y: 0, z: 0 });
		this.map.removeFromParent();
		this.map = this.renderedMaps.splice(index, 1)[0];

		const enemyTiles = this.map.children.filter((tile) => tile.userData.enemy);
		let unplacedEnemy= enemies.members.find((enemy) => !enemy.tile);
		while (unplacedEnemy) {
			const placementTile = oneOf(enemyTiles);
			this.placeCharacter({ character: unplacedEnemy }, placementTile, true);
			unplacedEnemy = enemies.members.find((enemy) => !enemy.tile);
		} while (unplacedEnemy);

		this.map.children.forEach((tile) => {
			const characterAtPosition = Array.from(this.placedCharacters.members).find(
				(character) => positionEquals(tile.position, character.position)
			);
			if (!characterAtPosition) return;
			this.placeCharacter({ character: characterAtPosition }, tile);
		});
		this.mapType = mapType;
		this.directionalLight.target = this.map;
		this.camera.zoom = 3;
		this.focalPoint.position.set(0, 0, 0);
		if (this.mapType === "mountain") {
			this.camera.zoom = 2;
			this.focalPoint.y = -3;
		}
		
		this.camera.position.set(-24, 24, -24);
		this.camera.lookAt(this.map.position);
		this.camera.updateProjectionMatrix();
		this.focalPoint.add(this.map);
		await this.createPanAnimation({endPosition: new Vector3(-24, 24, -24), steps: [
			new Vector3(-24, 10, -24),
			new Vector3(24, 10, -24),
			new Vector3(24, 10, 24),
			new Vector3(-24, 10, 24),
			new Vector3(-24, 10, -24),
		], panStepDuration: 1});
	}

	async startBattle() {
		this.participants = [...this.placedCharacters.members, ...enemies.members].sort(
			turnSort
		);
		this.participants.forEach((character) => {
			character.hp = character.maxhp;
			character.mana = character.maxmana;
		});
		this.currentTime = 0;
		this.currentParticipant = this.participants[0];
		this.focus();
		if (enemies.members.includes(this.currentParticipant))
			return this.performTurn();
		return this.currentParticipant.passable;
	}

	focus(position = this.currentParticipant.tile.position) {
		return this.createMoveAnimation({ endPosition: position });
	}

	initiateMove() {
		this.phase = "move";
		this.markInteractibles(this.currentParticipant.move, this.phase);
	}

	initiateAttack() {
		this.phase = "action";
		this.action = "attack";
		this.markInteractibles(this.currentParticipant.attackRange, this.phase);
	}

	#determineInteractible = {
		action: (range) => {
			const tiles =
				this.currentParticipant.primaryAttack === "melee"
					? this.hackItOut(this.currentParticipant.tile, range)
					: this.rangeItOut(this.currentParticipant.tile, range);
			return Array.from(new Set(tiles));
		},
		move: async (range) => {
			const [tiles, paths] = await this.walkItOut(
				this.currentParticipant.tile,
				range
			);
			this.movePaths = paths;
			return Array.from(new Set(tiles));
		},
	};

	rangeItOut(startingTile, range, priorDirection) {
		const tiles = [];
		const tileQueue = [[startingTile, range]];
		while (tileQueue.length) {
			const [currentTile, remainingRange] = tileQueue.shift();
			for (let direction = 0; direction < 4; direction++) {
				const nextTilePosition = { ...currentTile.position };
				if (direction === 0) nextTilePosition.z += 1;
				else if (direction === 1) nextTilePosition.x += 1;
				else if (direction === 2) nextTilePosition.z -= 1;
				else if (direction === 3) nextTilePosition.x -= 1;
				const nextTile = this.map.children.find((tile) =>
					positionEquals(tile.position, nextTilePosition)
				);
				if (!nextTile || tiles.includes(nextTile)) continue;
				const tileParticipant = this.participants.find(
					(participant) => nextTile === participant.tile
				);
				let elevationChange =
					nextTile.userData.elevation - currentTile.userData.elevation;
				if (elevationChange < 0)
					elevationChange = Math.max(elevationChange, -0.4);
				let modifier = 0;
				if (nextTile.userData.tree) modifier += 0.8;
				if (nextTile.userData.rock) modifier += 0.2;
				if (tileParticipant) modifier += 0.8;
				let rangeDelta = Math.max(1 + elevationChange + modifier, 0.2);
				const newRemainingRange = remainingRange - rangeDelta;
				if (newRemainingRange >= 0) {
					tiles.push(nextTile);
					tileQueue.push([nextTile, newRemainingRange]);
				}
			}
		}
		return tiles;
	}

	hackItOut(startingTile, range) {
		const tiles = [];
		const tileQueue = [[startingTile, range]];
		while (tileQueue.length) {
			const [currentTile, remainingRange] = tileQueue.shift();
			for (let direction = 0; direction < 4; direction++) {
				const nextTilePosition = { ...currentTile.position };
				if (direction === 0) nextTilePosition.z += 1;
				else if (direction === 1) nextTilePosition.x += 1;
				else if (direction === 2) nextTilePosition.z -= 1;
				else if (direction === 3) nextTilePosition.x -= 1;
				const nextTile = this.map.children.find((tile) =>
					positionEquals(tile.position, nextTilePosition)
				);
				if (!nextTile || tiles.includes(nextTile)) continue;
				const elevationChange =
					nextTile.userData.elevation - currentTile.userData.elevation;
				let modifier = 0;
				if (nextTile.userData.rock) modifier += 0.8;
				let rangeDelta = Math.max(1, elevationChange + modifier);
				const newRemainingRange = remainingRange - rangeDelta;
				if (newRemainingRange >= 0) {
					tiles.push(nextTile);
					tileQueue.push([nextTile, newRemainingRange]);
				}
			}
		}
		return tiles;
	}

	async walkItOut(startingTile, range) {
		const tiles = new Set();
		const paths = new Set();
		const tileQueue = [[startingTile, range, new Set()]];
		while (tileQueue.length) {
			let [currentTile, remainingRange, path] = tileQueue.shift();
			let pathed = true;
			if (!paths.has(path)) paths.add(path);
			path.add(currentTile);
			for (let direction = 0; direction < 4; direction++) {
				const nextTilePosition = { ...currentTile.position };
				if (direction === 0) nextTilePosition.z += 1;
				else if (direction === 1) nextTilePosition.x += 1;
				else if (direction === 2) nextTilePosition.z -= 1;
				else if (direction === 3) nextTilePosition.x -= 1;
				const nextTile = this.map.children.find((tile) =>
					positionEquals(tile.position, nextTilePosition)
				);
				if (
					!nextTile ||
					tiles.has(nextTile) ||
					nextTile.userData.tree ||
					enemyPosition(nextTile)
				)
					continue;
				const tileParticipant = this.placedCharacters.members.find(
					(participant) => nextTile === participant.tile
				);
				if (!tileParticipant) {
					tiles.add(nextTile);
				}
				let elevationChange =
					nextTile.userData.elevation - currentTile.userData.elevation;
				if (elevationChange < 0)
					elevationChange = Math.max(elevationChange, -0.3);
				let modifier = 0;
				if (nextTile.userData.tree) modifier += 0.4;
				if (nextTile.userData.rock) modifier += 0.8;
				if (nextTile.userData.texture === "road") modifier -= 0.3;
				if (nextTile.userData.texture === "smallroad") modifier -= 0.2;
				if (nextTile.userData.texture === "snow") modifier += 0.4;
				const rangeDelta = Math.max(1 + elevationChange + modifier, 0.2);
				const newRemainingRange = remainingRange - rangeDelta;
				if (newRemainingRange > 0) {
					tileQueue.push([
						nextTile,
						newRemainingRange,
						pathed ? path : new Set(path),
					]);
					pathed = false;
				} else {
					path.add(nextTile);
					break;
				}
			}
		}
		return [tiles, paths];
	}

	async markInteractibles(range, action) {
		this.clearInteractible();
		this.interactible = await this.#determineInteractible[action](range);
		this.interactible.forEach((tile) => {
			const material = new MeshBasicMaterial({
				map: new CanvasTexture(
					createTerrainSide(
						tile.userData.texture === "snow"
							? "inverted-interactable"
							: "interactable"
					)
				),
			});
			material.opacity = 0.6;
			material.transparent = true;
			const interactTile = new Mesh(new BoxGeometry(1, 0.1, 1), material);
			interactTile.position.y =
				tile.position.y + 0.25 + (tile.userData.rock ? 1 : 0);
			interactTile.userData.type = action;
			tile.add(interactTile);
		});
	}

	async move(position) {
		const possiblePaths = Array.from(this.movePaths).filter((setPath) => {
			const path = Array.from(setPath);
			return path.includes(this.intersectedObject.parent);
		});
		const fullPath = Array.from(
			possiblePaths.find(
				(path) =>
					path.size === Math.min(...possiblePaths.map((path) => path.size))
			)
		);
		const path = fullPath.reduce((acc, current) => {
			if (acc[acc.length - 1] === this.intersectedObject.parent) return acc;
			acc.push(current);
			return acc;
		}, []);
		while (path.length > 1) {
			const startBlock = path.shift();
			const endBlock = path[0];
			const startPosition = startBlock.position;
			const endPosition = endBlock.position;
			const endPointVector = new Vector3(
				this.currentParticipant.avatar.mesh.position.x +
					(endPosition.x - startPosition.x),
				this.currentParticipant.avatar.mesh.position.y +
					(endBlock.userData.elevation - startBlock.userData.elevation) +
					(endBlock.userData?.rock ? 1 : 0) -
					(startBlock.userData?.rock ? 1 : 0),
				this.currentParticipant.avatar.mesh.position.z +
					(endPosition.z - startPosition.z)
			);
			await this.createMoveAnimation({
				mesh: this.currentParticipant.avatar.mesh,
				startPosition: this.currentParticipant.avatar.mesh.position,
				endPosition,
				endPointVector,
				moreSteps: path.length > 1,
			});
			this.currentParticipant.tile = endBlock;
		}
		this.focus();
		this.clearInteractible();
		this.phase = "";
		return "move";
	}

	async attack(position) {
		const victim = this.participants.find(({ avatar }) =>
			positionEquals(
				avatar.mesh.userData.childOf.position,
				this.intersectedObject.parent.position
			)
		);
		this.lookAt(
			this.currentParticipant.avatar.mesh,
			this.currentParticipant.avatar.mesh.userData.childOf.position,
			victim.avatar.mesh.userData.childOf.position
		);

    await this.currentParticipant.avatar.swapAnimation('punch', {clamp: true, loop: LoopOnce, await: 0.5, onFinish: () => {
      this.currentParticipant.avatar.swapAnimation('idle');
    }});

    if (sameTeam(victim, this.currentParticipant)) console.log("same team");
		const damage = rollDice(...this.currentParticipant.damage);
		this.currentParticipant.degradeWeapon(damage);
		this.currentParticipant.progressSkill(
			this.currentParticipant.equipment.get("primary hand")?.subType ||
				"unarmed"
		);
		victim.distributeDamage(damage);
		if (victim.hp <= 0) victim.die();
		const vector = new Vector3().subVectors(
			victim.avatar.mesh.userData.childOf.position,
			this.currentParticipant.avatar.mesh.userData.childOf.position
		);
		vector.x += 0.5;
		vector.y += 2;
		vector.project(this.camera);
		vector.x = ((vector.x + 1) * this.canvas.width) / 2;
		vector.y = (-(vector.y - 1) * this.canvas.height) / 2;

		this.clearInteractible();
		this.phase = "";
		return ["action", damage, { x: vector.x, y: vector.y }];
	}

	clearInteractible() {
		if (!this.interactible) this.interactible = [];
		this.interactible.forEach((tile) =>
			tile.children
				.find((actionTile) => /action|move/.test(actionTile.userData.type))
				?.removeFromParent()
		);
		this.interactible = [];
	}

	endTurn() {
		this.clearInteractible();
		this.currentParticipant.nextMove =
			this.currentTime +
			1 / (0.25 * this.currentParticipant.stats.get("speed").level);
		this.participants.sort(turnSort);
		this.currentParticipant = this.participants[0];
		this.currentTime = this.currentParticipant.nextMove;
		if (this.currentParticipant.dead) return this.endTurn();
		this.focus();
		if (enemies.members.includes(this.currentParticipant))
			return this.performTurn();
		return this.currentParticipant.passable;
	}

	/**
	 * Find a path from the current participant to the target
	 * @param {Vector3} startPosition
	 * @param {Vector3} endPosition
	 */
	findPath(startPosition, endPosition) {
		const path = [];
		const queue = [{ position: startPosition, distance: 0 }];
		const visited = new Set();
		while (queue.length) {
			const current = queue.shift();
			if (positionEquals(current.position, endPosition)) {
				path.push(current.position);
				return path;
			}
			if (visited.has(current.position)) continue;
			visited.add(current.position);
			const tiles = this.map.children.filter((tile) =>
				positionEquals(tile.position, current.position)
			);
			tiles.forEach((tile) => {
				const tilePosition = tile.position;
				const tileNeighbors = [
					[tilePosition.x + 1, tilePosition.z],
					[tilePosition.x - 1, tilePosition.z],
					[tilePosition.x, tilePosition.z + 1],
					[tilePosition.x, tilePosition.z - 1],
				];
				tileNeighbors.forEach((neighbor) => {
					const neighborTile = this.map.children.find((tile) =>
						positionEquals(tile.position, neighbor)
					);
					if (neighborTile && !visited.has(neighborTile.position)) {
						queue.push({
							position: neighborTile.position,
							distance: current.distance + 1,
						});
					}
				});
			});
		}
		return path;
	}

	async performTurn() {
		return this.endTurn();
		if (!this.currentParticipant.personality)
			this.currentParticipant.personality = oneOf([
				"aggressive",
				"support",
				"defensive",
			]);
		/**  
        if currentParticipant does not have a target 
          find a target
        if target is in range
          attack target
        else
          move towards target
    */
		const target = this.currentParticipant.target;
		if (!target) {
			const targetCandidates = this.participants.filter(
				(participant) => participant !== this.currentParticipant
			);
			const target = oneOf(targetCandidates);
			this.currentParticipant.target = target;
		}
		const targetPosition = target.avatar.mesh.userData.childOf.position;
		const targetDistance = distance(
			this.currentParticipant.avatar.mesh.userData.childOf.position,
			targetPosition
		);
		if (targetDistance <= this.currentParticipant.range) {
			return this.attack(targetPosition);
		} else {
			const path = await this.findPath(
				this.currentParticipant.avatar.mesh.userData.childOf.position,
				targetPosition
			);
			const nextTile = path[1];
			if (nextTile) {
				const nextTilePosition = nextTile.position;
				const nextTileDistance = distance(
					this.currentParticipant.avatar.mesh.userData.childOf.position,
					nextTilePosition
				);
				if (nextTileDistance <= this.currentParticipant.move) {
					return this.move(nextTilePosition);
				}
				await this.initiateAttack();
				const charactersInRange = characters.filter((character) =>
					this.interactible.find((tile) => character.tile === tile)
				);
				if (
					this.currentParticipant.target &&
					charactersInRange.find(
						(character) => character === this.currentParticipant.target
					)
				) {
				}
				// if (this.currentParticipant.personality === 'aggressive') {
				// }
			}
		}
	}

	/**
	 * turn the target in the direction
	 * @param {Object3D} mesh the mesh to be rotated
	 * @param {Vector3} startRef the starting Vector3
	 * @param {Vector3} endRef the ending Vector3
	 */
	lookAt(mesh, startRef, endRef) {
		const end = copyVector(endRef);
		const lookTo = end.sub(copyVector(startRef));
		lookTo.y = 0;
		const lookingAt = new Vector3(0, 0, 0);
		mesh.getWorldDirection(lookingAt);
		lookingAt.applyQuaternion(
			new Quaternion(...this.focalPoint.quaternion.toArray()).invert()
		);
		let angle = lookingAt.angleTo(lookTo.normalize());
		const orientation = lookingAt.x * lookTo.z - lookingAt.z * lookTo.x;
		if (orientation > 0) angle = 2 * Math.PI - angle;
		mesh.rotateY(angle);
	}

	createPanAnimation({
		mesh = this.camera,
		startPosition = this.camera.position,
		endPosition,
		steps = [],
		panStepDuration = 1
	}) {
		return new Promise(resolve => {
			const temporalAnimation = {
				mixer: new AnimationMixer(mesh),
				clock: new Clock(),
			};
			const animationTiming = [0, ...steps.map(() => 1), 1].map((step, index) => panStepDuration*index);
			const positionStops = [...startPosition.toArray()];
			if(steps.length) positionStops.push(...steps.flatMap(step => step.toArray()));
			positionStops.push(...endPosition.toArray());
			const translationTrack = new VectorKeyframeTrack(
				".position",
				animationTiming,
				positionStops,
				InterpolateSmooth
			);
			const rotationStops = [...mesh.quaternion.toArray()];
			const dummyCamera = this.camera.clone();
			if(steps.length) {
				steps.forEach(step => {
					dummyCamera.position.set(...step.toArray());
					dummyCamera.lookAt(this.focalPoint.position);
					rotationStops.push(...dummyCamera.quaternion.toArray());
				});
			}
			this.scene.add(dummyCamera);
			dummyCamera.position.set(endPosition.x, endPosition.y, endPosition.z);
			dummyCamera.lookAt(this.focalPoint.position);
			rotationStops.push(...dummyCamera.quaternion.toArray());
			
			const rotationTrack = new QuaternionKeyframeTrack(
				".quaternion",
				animationTiming,
				rotationStops,
				InterpolateSmooth
			);
			const animationClip = new AnimationClip(null, -1, [translationTrack, rotationTrack]);
			const animationAction = temporalAnimation.mixer.clipAction(animationClip);
			animationAction.play();
			if (!mesh.userData.clock) mesh.userData.clock = new Clock();
			mesh.userData.temporalAnimation = temporalAnimation;
			this.animationsObjects.push(mesh);
			temporalAnimation.mixer.addEventListener(
				"loop",
				() => {
					requestAnimationFrame(() => {
						dummyCamera.removeFromParent();
						mesh.position.set(...endPosition.toArray());
						mesh.lookAt(this.map.position);
						mesh.updateProjectionMatrix();
						resolve();
					});
					animationAction.stop();
					temporalAnimation.mixer.uncacheAction(animationClip, mesh);
					this.animationsObjects.splice(
						this.animationsObjects.indexOf(mesh),
						1
					);
				},
				{ once: true }
			);
		})
	}

	createMoveAnimation({
		mesh = this.map,
		startPosition = this.map.position,
		endPosition,
		endPointVector,
		moreSteps,
	}) {
		return new Promise((resolve) => {
			const temporalAnimation = {
				mixer: new AnimationMixer(mesh),
				clock: new Clock(),
			};
			if (!endPointVector) {
				endPointVector = new Vector3(
					-endPosition.x,
					startPosition.y,
					-endPosition.z
				);
			}
			const animationTiming = mesh.userData.animations?.actions?.walk
				? startPosition.distanceTo(endPointVector) / 2
				: 0.3;
			const track = new VectorKeyframeTrack(
				".position",
				[0, animationTiming],
				[
					startPosition.x,
					startPosition.y,
					startPosition.z,
					...endPointVector.toArray(),
				]
			);
			const animationClip = new AnimationClip(null, -1, [track]);
			const animationAction = temporalAnimation.mixer.clipAction(animationClip);
			animationAction.play();
			if (!mesh.userData.clock) mesh.userData.clock = new Clock();
			mesh.userData.temporalAnimation = temporalAnimation;
			this.animationsObjects.push(mesh);
			if (mesh.userData.animations?.actions?.walk) {
				this.lookAt(mesh, startPosition, endPointVector);

				const heightDistance =
					Math.max(endPointVector.y, startPosition.y) -
					Math.min(endPointVector.y, startPosition.y);
				if (heightDistance < 0.33) {
          this.currentParticipant.avatar.swapAnimation("walk");
				} else {
          this.currentParticipant.avatar.swapAnimation("jump");
				}
			}
			temporalAnimation.mixer.addEventListener(
				"loop",
				() => {
					requestAnimationFrame(() => {
						mesh.position.set(...endPointVector.toArray());
						resolve();
					});
					delete mesh.userData.temporalAnimation;
					animationAction.stop();
					temporalAnimation.mixer.uncacheAction(animationClip, mesh);
					if (mesh.userData.animations?.actions?.walk && !moreSteps) {
            this.currentParticipant.avatar.swapAnimation("idle");
					}
					this.animationsObjects.splice(
						this.animationsObjects.indexOf(mesh),
						1
					);
				},
				{ once: true }
			);
		});
	}

	async removeChildren() {
		this.intersectedObject.children.forEach((child) => {
			const character = characters.members.find(
				(character) => character.avatar.mesh === child
			);
			character.placed = false;
			child.removeFromParent();
		});
	}

	async placeCharacter(
		{ character, characterIndex },
		placement = this.intersectedObject,
		enemy
	) {
		placement.children.forEach((child) => child.removeFromParent());
		if(placement.children.length) {
			const remove = enemies.members.find(({avatar}) => avatar.mesh === placement.children[0]);
			remove.placed = false;
			remove.tile = false;
			remove.position = false;
			placement.children[0].removeFromParent();
		}
		if (!character) character = characters.members[characterIndex];
		character.tile = placement;
		character.placed = true;
		character.position = { ...placement.position };
    
    if(character.position.z > 0) {
      character.avatar.mesh.setRotationFromAxisAngle(new Vector3(0,1,0), Math.PI);
    }
		const characterAtPosition = characters.members.find(
			(char) =>
				char !== character && positionEquals(char.position, character.position)
		);
		if (characterAtPosition) characterAtPosition.position = null;
		character.avatar.mesh.position.y =
			placement.geometry.parameters.height * 0.5;
		placement.add(character.avatar.mesh);
		if (!enemy) this.placedCharacters.add(character);
		if (character.avatar.mesh.userData.animations)
			this.characterAnimations.push(character.avatar.mesh);
	}

	determineIntersectionObject() {
		this.raycaster.setFromCamera(this.mousePosition, this.camera);
		const intersects = this.raycaster.intersectObjects(
			this.map?.children || [],
			true
		);
		const intersect = intersects.find(
			({ object }) => object?.userData?.type === this.phase
		);
		if (intersect && intersect?.object?.userData?.type === this.phase) {
			if (
				this.intersectedObject &&
				this.intersectedObject !== intersect.object
			) {
				this.intersectedObject.material.map =
					this.intersectedObject.userData.materialMap;
				this.intersectedObject.material.opacity =
					this.intersectedObject.userData.opacity;
			}
			if (this.intersectedObject === intersect.object) return;
			this.intersectedObject =
				intersect.object.userData.childOf || intersect.object;
			this.intersectedObject.userData.materialMap =
				this.intersectedObject.material.map;
			this.intersectedObject.userData.opacity =
				this.intersectedObject.material.opacity;
			this.intersectedObject.material.map = new CanvasTexture(
				createTerrainSide("highlight")
			);
			this.intersectedObject.material.opacity = 1;
		} else if (this.intersectedObject) {
			this.intersectedObject.material.map =
				this.intersectedObject.userData.materialMap;
			this.intersectedObject.material.opacity =
				this.intersectedObject.userData.opacity;
			this.intersectedObject = false;
		}
	}

	render() {
		if (this.focalPoint) this.focalPoint.rotation.y = this.rotation?.dx || 0;
		this.renderer.render(this.scene, this.camera);
		[...this.characterAnimations, ...this.animationsObjects].forEach((mesh) => {
			["animations", "temporalAnimation"].forEach((animation) => {
				if (mesh.userData?.[animation]) {
					mesh.userData[animation].mixer.update(
						mesh.userData[animation].clock.getDelta()
					);
				}
			});
		});
		requestAnimationFrame((time) => this.render(time));
	}
}
expose(GameMap);
