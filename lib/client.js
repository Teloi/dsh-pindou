window.__ModuleLoader__.load({
	id: "dsh-pindou",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		let react = require("react");
		let react_dom = require("react-dom");
		let react_jsx_runtime = require("react/jsx-runtime");
		// src/core/palette.ts
		const PALETTE = Object.freeze([
			{
				code: "0",
				hex: "#F6F4EE",
				zh: "白",
				en: "White"
			},
			{
				code: "1",
				hex: "#F2DFA7",
				zh: "奶油",
				en: "Cream"
			},
			{
				code: "2",
				hex: "#F7C531",
				zh: "黄",
				en: "Yellow"
			},
			{
				code: "3",
				hex: "#F08A24",
				zh: "橙",
				en: "Orange"
			},
			{
				code: "4",
				hex: "#D7333B",
				zh: "红",
				en: "Red"
			},
			{
				code: "5",
				hex: "#F39DC1",
				zh: "粉",
				en: "Pink"
			},
			{
				code: "6",
				hex: "#8A5BB5",
				zh: "紫",
				en: "Purple"
			},
			{
				code: "7",
				hex: "#2D4FA0",
				zh: "藏青",
				en: "Navy"
			},
			{
				code: "8",
				hex: "#62B6E9",
				zh: "天蓝",
				en: "Sky"
			},
			{
				code: "9",
				hex: "#24A79A",
				zh: "青绿",
				en: "Teal"
			},
			{
				code: "a",
				hex: "#3E9C4A",
				zh: "绿",
				en: "Green"
			},
			{
				code: "b",
				hex: "#A9D46A",
				zh: "草绿",
				en: "Lime"
			},
			{
				code: "c",
				hex: "#87573A",
				zh: "棕",
				en: "Brown"
			},
			{
				code: "d",
				hex: "#D7A473",
				zh: "浅棕",
				en: "Tan"
			},
			{
				code: "e",
				hex: "#9DA1A8",
				zh: "灰",
				en: "Gray"
			},
			{
				code: "f",
				hex: "#26272B",
				zh: "黑",
				en: "Black"
			}
		]);
		const COLOR_COUNT = PALETTE.length;
		/** Convert a colour index to its encoding character ('.' for empty). */
		function codeOf(index) {
			return index >= 0 && index < COLOR_COUNT ? PALETTE[index].code : ".";
		}
		/** Strict decode of one encoding character; undefined when not part of the alphabet. */
		function indexOfCode(ch) {
			if (ch === ".") return -1;
			const n = Number.parseInt(ch, 16);
			return ch.length === 1 && /^[0-9a-f]$/.test(ch) ? n : void 0;
		}
		function isColorIndex(value) {
			return typeof value === "number" && Number.isInteger(value) && value >= 0 && value < COLOR_COUNT;
		}
		// src/core/board.ts
		const BOARD_SIZES = [
			12,
			16,
			24
		];
		function isBoardSize(value) {
			return BOARD_SIZES.includes(value);
		}
		function createBoard(size = 16) {
			return {
				size,
				cells: Object.freeze(Array.from({ length: size * size }, () => -1))
			};
		}
		function inBounds(board, x, y) {
			return Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < board.size && y < board.size;
		}
		function getCell(board, x, y) {
			return inBounds(board, x, y) ? board.cells[y * board.size + x] : -1;
		}
		/**
		* Set one cell. Returns the same board object when nothing changes, which lets
		* callers (history, React) skip work for no-op paints during a drag.
		*/
		function setCell(board, x, y, value) {
			if (!inBounds(board, x, y)) return board;
			const v = isColorIndex(value) ? value : -1;
			const i = y * board.size + x;
			if (board.cells[i] === v) return board;
			const cells = board.cells.slice();
			cells[i] = v;
			return {
				size: board.size,
				cells: Object.freeze(cells)
			};
		}
		/** Cells on the straight line between two points (Bresenham), so fast drags leave no gaps. */
		function lineCells(x0, y0, x1, y1) {
			const out = [];
			let x = x0;
			let y = y0;
			const dx = Math.abs(x1 - x0);
			const dy = -Math.abs(y1 - y0);
			const sx = x0 < x1 ? 1 : -1;
			const sy = y0 < y1 ? 1 : -1;
			let err = dx + dy;
			for (let guard = 0; guard < 4096; guard++) {
				out.push([x, y]);
				if (x === x1 && y === y1) break;
				const e2 = 2 * err;
				if (e2 >= dy) {
					err += dy;
					x += sx;
				}
				if (e2 <= dx) {
					err += dx;
					y += sy;
				}
			}
			return out;
		}
		function paintLine(board, x0, y0, x1, y1, value) {
			let next = board;
			for (const [x, y] of lineCells(x0, y0, x1, y1)) next = setCell(next, x, y, value);
			return next;
		}
		/** 4-connected flood fill from (x, y); returns the same board when nothing changes. */
		function floodFill(board, x, y, value) {
			if (!inBounds(board, x, y)) return board;
			const { size } = board;
			const from = board.cells[y * size + x];
			if (from === value) return board;
			const cells = [...board.cells];
			const stack = [y * size + x];
			while (stack.length > 0) {
				const i = stack.pop();
				if (cells[i] !== from) continue;
				cells[i] = value;
				const cx = i % size;
				if (cx > 0) stack.push(i - 1);
				if (cx < size - 1) stack.push(i + 1);
				if (i >= size) stack.push(i - size);
				if (i < size * (size - 1)) stack.push(i + size);
			}
			return {
				size,
				cells: Object.freeze(cells)
			};
		}
		function clearBoard(board) {
			return board.cells.every((c) => c === -1) ? board : createBoard(board.size);
		}
		/** Resize keeping the drawing centred; cells that fall outside are dropped. */
		function resizeBoard(board, size) {
			if (size === board.size) return board;
			const offset = Math.floor((size - board.size) / 2);
			let next = createBoard(size);
			const cells = next.cells.slice();
			for (let y = 0; y < board.size; y++) for (let x = 0; x < board.size; x++) {
				const nx = x + offset;
				const ny = y + offset;
				if (nx >= 0 && ny >= 0 && nx < size && ny < size) cells[ny * size + nx] = board.cells[y * board.size + x];
			}
			next = {
				size,
				cells: Object.freeze(cells)
			};
			return next;
		}
		function createHistory(present) {
			return {
				past: [],
				present,
				future: []
			};
		}
		/** Record a finished change. No-ops (same object) are ignored. */
		function push(history, next, limit = 100) {
			if (next === history.present) return history;
			const past = [...history.past, history.present];
			if (past.length > limit) past.splice(0, past.length - limit);
			return {
				past,
				present: next,
				future: []
			};
		}
		/** Start a stroke: further `preview` calls update the present without new entries. */
		function begin(history) {
			if (history.strokeBase !== void 0) return history;
			return {
				...history,
				strokeBase: history.present
			};
		}
		function preview(history, next) {
			if (history.strokeBase === void 0) return push(history, next);
			return next === history.present ? history : {
				...history,
				present: next
			};
		}
		/** Finish a stroke as one history entry (or nothing when the stroke changed nothing). */
		function commit(history, limit = 100) {
			const base = history.strokeBase;
			if (base === void 0) return history;
			const settled = {
				past: history.past,
				present: base,
				future: history.future
			};
			return history.present === base ? settled : push(settled, history.present, limit);
		}
		function canUndo(history) {
			return history.past.length > 0 && history.strokeBase === void 0;
		}
		function canRedo(history) {
			return history.future.length > 0 && history.strokeBase === void 0;
		}
		function undo(history) {
			const h = commit(history);
			const prev = h.past[h.past.length - 1];
			if (prev === void 0) return h;
			return {
				past: h.past.slice(0, -1),
				present: prev,
				future: [h.present, ...h.future]
			};
		}
		function redo(history) {
			const h = commit(history);
			const [next, ...rest] = h.future;
			if (next === void 0) return h;
			return {
				past: [...h.past, h.present],
				present: next,
				future: rest
			};
		}
		// src/core/codec.ts
		/**
		* Compact board encoding: one character per cell, row-major, `.` for empty and
		* `0`–`f` for palette indices. A 16×16 board is exactly 256 characters.
		*/
		function encode(board) {
			return board.cells.map(codeOf).join("");
		}
		/** Strict decode: whitespace between rows is allowed, anything else must be exact. */
		function decode(text, size) {
			if (!isBoardSize(size)) return {
				ok: false,
				error: "size"
			};
			const flat = text.replace(/\s+/g, "");
			if (flat.length !== size * size) return {
				ok: false,
				error: "length"
			};
			const cells = [];
			for (const ch of flat) {
				const v = indexOfCode(ch);
				if (v === void 0) return {
					ok: false,
					error: "char"
				};
				cells.push(v);
			}
			return {
				ok: true,
				board: {
					size,
					cells: Object.freeze(cells)
				}
			};
		}
		// src/core/completion.ts
		function completion(board, target) {
			if (board.size !== target.size) return {
				matched: 0,
				total: 0,
				wrong: 0,
				percent: 0,
				done: false
			};
			let matched = 0;
			let total = 0;
			let wrong = 0;
			for (let i = 0; i < target.cells.length; i++) {
				const want = target.cells[i];
				const have = board.cells[i];
				if (want !== -1) {
					total++;
					if (have === want) matched++;
					else if (have !== -1) wrong++;
				} else if (have !== -1) wrong++;
			}
			const done = total > 0 && matched === total && wrong === 0;
			const raw = total === 0 ? 0 : Math.floor(matched / total * 100);
			return {
				matched,
				total,
				wrong,
				percent: done ? 100 : Math.min(raw, 99),
				done
			};
		}
		/** Remaining cells per colour, for "what's left" hints. */
		function remainingByColor(board, target) {
			const out = /* @__PURE__ */ new Map();
			if (board.size !== target.size) return out;
			target.cells.forEach((want, i) => {
				if (want !== -1 && board.cells[i] !== want) out.set(want, (out.get(want) ?? 0) + 1);
			});
			return out;
		}
		// src/core/templates.ts
		const TEMPLATE_DEFS = Object.freeze([
			{
				id: "heart",
				zh: "爱心",
				en: "Heart",
				rows: [
					"................",
					"................",
					"..4444....4444..",
					".444444..444444.",
					".40044444444444.",
					".40444444444444.",
					".44444444444444.",
					".44444444444444.",
					"..444444444444..",
					"...4444444444...",
					"....44444444....",
					".....444444.....",
					"......4444......",
					".......44.......",
					"................",
					"................"
				]
			},
			{
				id: "whale",
				zh: "小鲸鱼",
				en: "Little Whale",
				rows: [
					"................",
					".....8.8........",
					"......8.........",
					"....77777.......",
					"..777777777..77.",
					".77777777777.77.",
					".77f77777777777.",
					"777777777777777.",
					"755777777777777.",
					"788888777777777.",
					".8888888877777..",
					"..88888888777...",
					"....8888777.....",
					"................",
					".99..99..99..99.",
					"9..99..99..99..9"
				]
			},
			{
				id: "coffee",
				zh: "咖啡杯",
				en: "Coffee Cup",
				rows: [
					"................",
					".....e...e......",
					"....e...e.......",
					".....e...e......",
					"....e...e.......",
					"................",
					"..eeeeeeeeee....",
					"..ecccccccce....",
					"..e00000000eee..",
					"..e00040400e.e..",
					"..e00044400e.e..",
					"..e00004000eee..",
					"...e000000e.....",
					"....eeeeee......",
					".eeeeeeeeeeee...",
					"................"
				]
			},
			{
				id: "cat",
				zh: "橘猫",
				en: "Orange Cat",
				rows: [
					"................",
					"................",
					"..33........33..",
					"..333......333..",
					"..353333333353..",
					"..333333333333..",
					".33333333333333.",
					".333f333333f333.",
					".333f333333f333.",
					".35333355333353.",
					".333333ff333333.",
					"..333333333333..",
					"...3333333333...",
					"....33333333....",
					"................",
					"................"
				]
			},
			{
				id: "mushroom",
				zh: "蘑菇",
				en: "Mushroom",
				rows: [
					"................",
					".....444444.....",
					"...4444444444...",
					"..440044444004..",
					".44400444444004.",
					".44444440044444.",
					".44444444444444.",
					"..444444444444..",
					"....11111111....",
					"...1111111111...",
					"...11f1111f11...",
					"...1511111151...",
					"...1111ff1111...",
					"....11111111....",
					"................",
					"................"
				]
			},
			{
				id: "star",
				zh: "星星",
				en: "Star",
				rows: [
					"................",
					".......22.......",
					".......22.......",
					"......2222......",
					"......2222......",
					".22222222222222.",
					"..222222222222..",
					"...222f22f222...",
					"....22522522....",
					"....22222222....",
					"...2222222222...",
					"...2222..2222...",
					"..2222....2222..",
					"..222......222..",
					".22..........22.",
					"................"
				]
			},
			{
				id: "flower",
				zh: "小花",
				en: "Flower",
				rows: [
					"................",
					"......5555......",
					"....55555555....",
					"...5555555555...",
					"..555552255555..",
					"..555522225555..",
					"..555522225555..",
					"..555552255555..",
					"...5555555555...",
					"....55555555....",
					".......aa.......",
					"..bbb..aa.......",
					"..bbbb.aa..bbb..",
					"...bbbbaabbbb...",
					".......aa.......",
					"....cccccccc...."
				]
			},
			{
				id: "cherry",
				zh: "樱桃",
				en: "Cherry",
				rows: [
					"................",
					"..........aa....",
					".........abb....",
					"........a.bbb...",
					".......a...b....",
					"......a.a.......",
					".....a...a......",
					"....a.....a.....",
					"..4444...4444...",
					".444404.444404..",
					".444444.444444..",
					".444444.444444..",
					".444444.444444..",
					"..4444...4444...",
					"................",
					"................"
				]
			},
			{
				id: "sun",
				zh: "太阳",
				en: "Sun",
				rows: [
					"................",
					".......33.......",
					"..3....33....3..",
					"...3........3...",
					".....222222.....",
					"....22222222....",
					"...2222222222...",
					"33.22f2222f22.33",
					"33.2222222222.33",
					"...2252222522...",
					"...2222ff2222...",
					"....22222222....",
					".....222222.....",
					"...3........3...",
					"..3....33....3..",
					".......33......."
				]
			},
			{
				id: "ghost",
				zh: "小幽灵",
				en: "Ghost",
				rows: [
					"................",
					".....000000.....",
					"...0000000000...",
					"..000000000000..",
					"..00ff0000ff00..",
					"..00ff0000ff00..",
					".00000000000000.",
					".05500000000550.",
					".00000000000000.",
					".00000000000000.",
					".00000000000000.",
					".00000000000000.",
					".00000000000000.",
					".00.000..000.00.",
					".0...0....0...0.",
					"................"
				]
			},
			{
				id: "invader",
				zh: "像素小怪",
				en: "Pixel Alien",
				rows: [
					"................",
					"................",
					"................",
					"................",
					"....6.....6.....",
					".....6...6......",
					"....6666666.....",
					"...66.666.66....",
					"..66666666666...",
					"..6.6666666.6...",
					"..6.6.....6.6...",
					".....66.66......",
					"................",
					"................",
					"................",
					"................"
				]
			},
			{
				id: "terminal",
				zh: "终端 >_",
				en: "Terminal",
				rows: [
					"................",
					"................",
					".ee4e2eaeeeeeee.",
					".ffffffffffffff.",
					".ffffffffffffff.",
					".ffafffffffffff.",
					".fffaffffffffff.",
					".ffffafffffffff.",
					".fffaffffffffff.",
					".ffafff0000ffff.",
					".ffffffffffffff.",
					".ffffffffffffff.",
					".ffffffffffffff.",
					".ffffffffffffff.",
					"................",
					"................"
				]
			}
		]);
		/** Display order: the designer's list first, then the extra patterns. */
		const ORDER = [
			"heart",
			"invader",
			"whale",
			"coffee",
			"mushroom",
			"terminal",
			"cat",
			"star",
			"cherry",
			"flower",
			"sun",
			"ghost"
		];
		function build(def) {
			const result = decode(def.rows.join(""), 16);
			if (!result.ok) throw new Error(`pindou: template ${def.id} is malformed (${result.error})`);
			const board = result.board;
			const used = board.cells.filter((c) => c >= 0);
			const colors = new Set(used).size;
			const beads = used.length;
			const difficulty = colors <= 2 && beads <= 120 ? 1 : colors >= 6 || board.size === 24 ? 3 : 2;
			return {
				...def,
				board,
				colors,
				beads,
				difficulty
			};
		}
		const TEMPLATES = Object.freeze(TEMPLATE_DEFS.map(build).toSorted((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id)));
		function findTemplate(id) {
			return TEMPLATES.find((t) => t.id === id);
		}
		/**
		* Clean a user subject: drop control and formatting characters, collapse
		* whitespace, cap the length. Returns '' when nothing usable is left.
		*/
		function sanitizePrompt(input) {
			if (typeof input !== "string") return "";
			return [...input.normalize("NFKC").replace(/[\p{Cc}\p{Cf}\p{Co}\p{Cs}]/gu, " ").replace(/\s+/g, " ").trim()].slice(0, 60).join("");
		}
		/** Cache key: case/space-insensitive subject plus board size. */
		function promptKey(prompt, size) {
			return `${size}:${sanitizePrompt(prompt).toLowerCase()}`;
		}
		PALETTE.map((c) => `${c.code}=${c.en.toLowerCase()}`).join(" ");
		// src/core/storage.ts
		const STORAGE_KEY = "dsh-pindou:v1";
		const DEFAULT_PREFS = {
			busyHint: true,
			showGuide: true,
			showCodes: false
		};
		function defaultState(size = 16) {
			return {
				board: createBoard(size),
				color: 4,
				tool: "paint",
				mode: "home",
				target: null,
				ironed: false,
				prefs: DEFAULT_PREFS,
				done: [],
				coached: false
			};
		}
		const TOOLS$1 = [
			"paint",
			"erase",
			"pick",
			"fill"
		];
		const MODES = [
			"home",
			"play",
			"ai"
		];
		const ID_RE = /^[a-z0-9-]{1,32}$/;
		/** Parse untrusted JSON into a state; anything invalid falls back field by field. */
		function parseState(json) {
			const fallback = defaultState();
			if (json === null) return {
				state: fallback,
				corrupt: false
			};
			let raw;
			try {
				raw = JSON.parse(json);
			} catch {
				return {
					state: fallback,
					corrupt: true
				};
			}
			if (typeof raw !== "object" || raw === null) return {
				state: fallback,
				corrupt: true
			};
			const r = raw;
			let corrupt = false;
			let board = fallback.board;
			if (isBoardSize(r["size"]) && typeof r["board"] === "string") {
				const d = decode(r["board"], r["size"]);
				if (d.ok) board = d.board;
				else corrupt = true;
			} else corrupt = true;
			const prefsRaw = typeof r["prefs"] === "object" && r["prefs"] !== null ? r["prefs"] : {};
			return {
				state: {
					board,
					color: isColorIndex(r["color"]) ? r["color"] : fallback.color,
					tool: TOOLS$1.includes(r["tool"]) ? r["tool"] : fallback.tool,
					mode: MODES.includes(r["mode"]) ? r["mode"] : fallback.mode,
					target: typeof r["target"] === "string" && r["target"].length <= 700 ? r["target"] : null,
					ironed: r["ironed"] === true,
					prefs: {
						busyHint: typeof prefsRaw["busyHint"] === "boolean" ? prefsRaw["busyHint"] : DEFAULT_PREFS.busyHint,
						showGuide: typeof prefsRaw["showGuide"] === "boolean" ? prefsRaw["showGuide"] : DEFAULT_PREFS.showGuide,
						showCodes: typeof prefsRaw["showCodes"] === "boolean" ? prefsRaw["showCodes"] : DEFAULT_PREFS.showCodes
					},
					done: Array.isArray(r["done"]) ? [...new Set(r["done"].filter((id) => typeof id === "string" && ID_RE.test(id)))].slice(0, 64) : [],
					coached: r["coached"] === true
				},
				corrupt
			};
		}
		function serializeState(state) {
			return JSON.stringify({
				v: 1,
				size: state.board.size,
				board: encode(state.board),
				color: state.color,
				tool: state.tool,
				mode: state.mode,
				target: state.target,
				ironed: state.ironed,
				prefs: state.prefs,
				done: state.done,
				coached: state.coached
			});
		}
		/**
		* Storage that never throws: reads and writes degrade to memory when the
		* browser refuses (private mode, quota, disabled cookies, sandboxing).
		*/
		var SafeStore = class {
			backend;
			memory = /* @__PURE__ */ new Map();
			status = "ok";
			constructor(backend) {
				this.backend = backend;
				if (backend === void 0) this.status = "unavailable";
				else try {
					const probe = `${STORAGE_KEY}:probe`;
					backend.setItem(probe, "1");
					backend.removeItem(probe);
				} catch {
					this.status = "unavailable";
				}
			}
			get(key) {
				if (this.status !== "unavailable" && this.backend) try {
					return this.backend.getItem(key);
				} catch {
					this.status = "unavailable";
				}
				return this.memory.get(key) ?? null;
			}
			set(key, value) {
				if (value.length > 65536) return false;
				this.memory.set(key, value);
				if (this.status === "unavailable" || !this.backend) return false;
				try {
					this.backend.setItem(key, value);
					return true;
				} catch {
					this.status = "unavailable";
					return false;
				}
			}
			remove(key) {
				this.memory.delete(key);
				try {
					this.backend?.removeItem(key);
				} catch {}
			}
			loadState() {
				const { state, corrupt } = parseState(this.get(STORAGE_KEY));
				if (corrupt) {
					if (this.status === "ok") this.status = "recovered";
					this.remove(STORAGE_KEY);
				}
				return state;
			}
			saveState(state) {
				return this.set(STORAGE_KEY, serializeState(state));
			}
		};
		/** Resolve `window.localStorage` without throwing (access itself can throw). */
		function browserStorage() {
			try {
				return typeof globalThis.localStorage === "undefined" ? void 0 : globalThis.localStorage;
			} catch {
				return;
			}
		}
		// src/core/cache.ts
		const CACHE_KEY = "dsh-pindou:ai-cache:v1";
		/** A small LRU of validated generations, persisted beside the game state. */
		var GenerationCache = class GenerationCache {
			store;
			limit;
			entries = [];
			constructor(store, limit = 24) {
				this.store = store;
				this.limit = limit;
				this.entries = store ? GenerationCache.parse(store.get(CACHE_KEY)) : [];
			}
			static parse(json) {
				if (json === null) return [];
				try {
					const raw = JSON.parse(json);
					if (!Array.isArray(raw)) return [];
					return raw.filter((e) => {
						if (typeof e !== "object" || e === null) return false;
						const v = e;
						return typeof v["key"] === "string" && isBoardSize(v["size"]) && typeof v["flat"] === "string" && typeof v["at"] === "number" && decode(v["flat"], v["size"]).ok;
					}).slice(0, 24);
				} catch {
					return [];
				}
			}
			get(key) {
				const i = this.entries.findIndex((e) => e.key === key);
				if (i < 0) return void 0;
				const [hit] = this.entries.splice(i, 1);
				this.entries.unshift(hit);
				this.persist();
				return hit;
			}
			put(entry) {
				this.entries = [entry, ...this.entries.filter((e) => e.key !== entry.key)].slice(0, this.limit);
				this.persist();
			}
			get size() {
				return this.entries.length;
			}
			persist() {
				this.store?.set(CACHE_KEY, JSON.stringify(this.entries));
			}
		};
		// src/core/i18n.ts
		/**
		* UI copy, Chinese first (wording follows the designer's prototype). Keys are
		* shared by both dictionaries; the host's locale service substitutes `{name}`
		* parameters, and `translate` below does the same outside the host.
		*/
		const zh = {
			appName: "拼豆小憩",
			entryLabel: "拼豆小憩",
			entryBusyLabel: "拼豆小憩 — 模型正在忙，来拼一会儿？",
			hintText: "趁现在拼一个？",
			hintGo: "打开",
			hintClose: "关闭提示",
			guideDesc: "模型忙的时候，拼几颗豆子",
			back: "返回",
			settings: "设置",
			menuBusyHint: "忙时轻提示",
			menuCodes: "显示色号",
			menuGuide: "显示淡色引导",
			menuCoach: "重看新手引导",
			menuKeys: "快捷键",
			homeFree: "自由拼",
			homeFreeDesc: "空白豆板，随手拼",
			homeAi: "AI 生成",
			homeAiDesc: "一句话变图纸",
			homeTemplates: "模板",
			homeCount: "{n} 个",
			homeContinue: "继续上次",
			tplMeta: "{n} 色",
			tplAria: "{name}，{size}×{size}，{n} 色，难度 {diff}/3",
			tplDone: "已完成",
			playFree: "自由拼",
			playBeads: "{n} 颗",
			playEmpty: "点按或拖动放豆子",
			playWrong: "{n} 颗放错",
			playProgress: "{ok}/{total} · {pct}%",
			progressLabel: "完成度",
			aiTokens: "消耗 {n} tokens",
			aiTokensCached: "来自缓存 · 0 tokens",
			boardLabel: "{size}×{size} 豆板",
			boardHelp: "方向键移动，空格或回车放豆，Delete 擦除",
			cellLabel: "第 {row} 行第 {col} 列，{color}",
			cellGuide: "，图纸：{color}",
			emptyCell: "空",
			paletteLabel: "调色盘",
			colorTip: "{name} · {code}",
			toolsLabel: "工具",
			toolPaint: "画笔",
			toolErase: "橡皮",
			toolPick: "取色",
			toolFill: "填充",
			undo: "撤销",
			redo: "重做",
			clear: "清空",
			size: "尺寸",
			coachTitle: "30 秒上手",
			coachBody: "选一个颜色，在豆板上点按或拖动放豆；右键或橡皮拿掉。拼完点「熨烫」让豆子融在一起。",
			coachOk: "开始拼",
			doneTitle: "拼好啦！",
			doneBody: "要熨烫一下让它定型吗？",
			doneLater: "再改改",
			iron: "熨烫",
			ironing: "熨烫中…",
			resultTitle: "定型完成",
			resultCount: "{n} 颗 · {c} 色",
			unIron: "撤销熨烫",
			again: "再拼一个",
			exportPng: "导出 PNG",
			fillBoard: "一键铺满",
			toastCleared: "已清空",
			toastUndo: "撤销",
			toastLocked: "已定型，先「撤销熨烫」再改",
			toastExported: "已导出 PNG",
			toastExportFailed: "导出失败",
			storageUnavailable: "浏览器存储不可用，进度不会保存",
			storageRecovered: "本地存档损坏，已重置",
			dismiss: "关闭",
			aiPlaceholder: "描述你想拼的东西，比如：戴墨镜的柴犬",
			aiLabel: "描述",
			aiGenerate: "生成",
			aiGenerating: "正在构思图纸…",
			aiCancel: "取消",
			aiChars: "{n}/{max}",
			aiTipsTitle: "小贴士",
			aiTips: "越具体、越简单越好：一个主体 + 一两个特征。生成结果会作为图纸，你照着拼；也可以一键铺满。",
			aiExamples: "橘猫|西瓜|小火箭|恐龙|彩虹|仙人掌",
			aiRepaired: "模型输出有瑕疵，已自动修复",
			aiTruncated: "输出被截断，缺的部分留空",
			aiModel: "模型：{model}",
			aiMock: "演示模式：未调用真实模型",
			aiNotConfigured: "还没有可用的模型",
			aiNotConfiguredBody: "AI 生成会调用你在 DSH 中配置的模型。配置好后回来即可使用，其他玩法不受影响。",
			aiStep1: "打开 DSH 设置 → 模型",
			aiStep2: "添加 DeepSeek API Key 并选择默认模型（或设置环境变量 DEEPSEEK_API_KEY 后重启 DSH）",
			aiRecheck: "重新检测",
			aiPlayTemplates: "先玩模板",
			aiErrTitle: "生成失败",
			aiErrParse: "模型返回的内容拼不成图纸，换个说法再试试",
			aiErrNetwork: "网络或服务暂时不可用",
			aiErrBusy: "上一次生成还没结束",
			aiErrRate: "太快啦，稍等几秒再试",
			aiErrEmpty: "先写一句描述",
			aiErrTimeout: "模型响应超时，再试一次",
			aiRetry: "重试",
			keysTitle: "快捷键",
			keysTools: "B 画笔 · E 橡皮 · I 取色 · G 填充",
			keysColors: "1–9、0 选色，[ ] 切换颜色",
			keysHistory: "⌘/Ctrl+Z 撤销 · ⇧⌘/Ctrl+Z 重做",
			keysBoard: "方向键移动 · 空格/回车放豆 · Delete 擦除 · 右键擦除 · Alt+点按取色",
			keysEsc: "Esc 关闭菜单或卡片",
			celebrate: "完成！"
		};
		const en = {
			appName: "Bead Break",
			entryLabel: "Bead Break",
			entryBusyLabel: "Bead Break — the model is busy, play for a bit?",
			hintText: "Quick bead break?",
			hintGo: "Open",
			hintClose: "Dismiss hint",
			guideDesc: "Place a few beads while the model works",
			back: "Back",
			settings: "Settings",
			menuBusyHint: "Hint while busy",
			menuCodes: "Show color codes",
			menuGuide: "Show faint guide",
			menuCoach: "Show the intro again",
			menuKeys: "Keyboard shortcuts",
			homeFree: "Free play",
			homeFreeDesc: "Blank board, anything goes",
			homeAi: "AI pattern",
			homeAiDesc: "One sentence to a pattern",
			homeTemplates: "Patterns",
			homeCount: "{n}",
			homeContinue: "Continue",
			tplMeta: "{n} col",
			tplAria: "{name}, {size}×{size}, {n} colors, difficulty {diff}/3",
			tplDone: "Completed",
			playFree: "Free play",
			playBeads: "{n} beads",
			playEmpty: "Tap or drag to place beads",
			playWrong: "{n} misplaced",
			playProgress: "{ok}/{total} · {pct}%",
			progressLabel: "Progress",
			aiTokens: "{n} tokens",
			aiTokensCached: "cached · 0 tokens",
			boardLabel: "{size}×{size} bead board",
			boardHelp: "Arrow keys move, Space or Enter places, Delete erases",
			cellLabel: "Row {row}, column {col}, {color}",
			cellGuide: ", pattern: {color}",
			emptyCell: "empty",
			paletteLabel: "Palette",
			colorTip: "{name} · {code}",
			toolsLabel: "Tools",
			toolPaint: "Brush",
			toolErase: "Eraser",
			toolPick: "Picker",
			toolFill: "Fill",
			undo: "Undo",
			redo: "Redo",
			clear: "Clear",
			size: "Size",
			coachTitle: "30-second intro",
			coachBody: "Pick a color, then tap or drag on the board to place beads; right-click or the eraser removes them. When done, Iron to fuse the beads.",
			coachOk: "Start",
			doneTitle: "All done!",
			doneBody: "Iron it to fuse the beads?",
			doneLater: "Keep editing",
			iron: "Iron",
			ironing: "Ironing…",
			resultTitle: "Fused!",
			resultCount: "{n} beads · {c} colors",
			unIron: "Un-iron",
			again: "New one",
			exportPng: "Export PNG",
			fillBoard: "Fill board",
			toastCleared: "Board cleared",
			toastUndo: "Undo",
			toastLocked: "Fused — un-iron first to edit",
			toastExported: "PNG exported",
			toastExportFailed: "Export failed",
			storageUnavailable: "Browser storage unavailable — progress will not be saved",
			storageRecovered: "Saved data was corrupt and has been reset",
			dismiss: "Dismiss",
			aiPlaceholder: "Describe what to make, e.g. a shiba wearing sunglasses",
			aiLabel: "Description",
			aiGenerate: "Generate",
			aiGenerating: "Sketching a pattern…",
			aiCancel: "Cancel",
			aiChars: "{n}/{max}",
			aiTipsTitle: "Tips",
			aiTips: "Specific and simple works best: one subject plus a feature or two. The result becomes a pattern to follow — or fill it in one go.",
			aiExamples: "orange cat|watermelon|rocket|dinosaur|rainbow|cactus",
			aiRepaired: "The model output had flaws and was repaired",
			aiTruncated: "The output was cut off; missing cells are left empty",
			aiModel: "Model: {model}",
			aiMock: "Demo mode: no real model was called",
			aiNotConfigured: "No model available yet",
			aiNotConfiguredBody: "AI patterns use the model you configured in DSH. Come back once it is set up — everything else works without it.",
			aiStep1: "Open DSH Settings → Models",
			aiStep2: "Add a DeepSeek API key and pick a default model (or set DEEPSEEK_API_KEY and restart DSH)",
			aiRecheck: "Check again",
			aiPlayTemplates: "Play patterns",
			aiErrTitle: "Generation failed",
			aiErrParse: "The reply could not be turned into a pattern — try rephrasing",
			aiErrNetwork: "Network or service unavailable",
			aiErrBusy: "The previous generation is still running",
			aiErrRate: "Too fast — wait a few seconds",
			aiErrEmpty: "Write a short description first",
			aiErrTimeout: "The model took too long — try again",
			aiRetry: "Retry",
			keysTitle: "Keyboard shortcuts",
			keysTools: "B brush · E eraser · I picker · G fill",
			keysColors: "1–9, 0 pick a color; [ ] cycle",
			keysHistory: "⌘/Ctrl+Z undo · ⇧⌘/Ctrl+Z redo",
			keysBoard: "Arrows move · Space/Enter place · Delete erase · right-click erase · Alt+tap pick",
			keysEsc: "Esc closes menus and cards",
			celebrate: "Done!"
		};
		function translate(lang, key, params) {
			return ((lang === "en" ? en : zh)[key] ?? zh[key] ?? key).replace(/\{(\w+)\}/g, (m, name) => params && name in params ? String(params[name]) : m);
		}
		function makeTranslate(lang) {
			return (key, params) => translate(lang, key, params);
		}
		/** Document-relative form for the browser (keeps working under a mount path). */
		const GENERATE_ROUTE = "/api/pindou.generate".slice(1);
		const STATUS_ROUTE = "/api/pindou.status".slice(1);
		// src/client/api.ts
		/** Browser side of the Host route: relative URLs (works under a mount path), same-origin credentials. */
		const MAX_BODY = 65536;
		async function readJson(res) {
			const text = await res.text();
			if (text.length > MAX_BODY) throw new Error("response too large");
			return JSON.parse(text);
		}
		function fetchApi(fetchImpl = globalThis.fetch.bind(globalThis)) {
			return {
				async generate(body, signal) {
					const res = await fetchImpl(GENERATE_ROUTE, {
						method: "POST",
						credentials: "same-origin",
						headers: { "content-type": "application/json" },
						body: JSON.stringify(body),
						signal
					});
					const data = await readJson(res).catch(() => null);
					if (data && typeof data === "object" && "ok" in data) return data;
					return {
						ok: false,
						error: "upstream",
						message: `HTTP ${res.status}`
					};
				},
				async status(signal) {
					const res = await fetchImpl(STATUS_ROUTE, {
						credentials: "same-origin",
						signal
					});
					if (!res.ok) throw new Error(`HTTP ${res.status}`);
					const data = await readJson(res);
					return {
						configured: data.configured === true,
						route: [
							"mock",
							"host",
							"direct",
							"none"
						].includes(data.route) ? data.route : "none",
						model: typeof data.model === "string" ? data.model.slice(0, 80) : void 0
					};
				}
			};
		}
		// src/client/icons.tsx
		const base = {
			viewBox: "0 0 20 20",
			fill: "none",
			stroke: "currentColor",
			strokeWidth: 1.6,
			strokeLinecap: "round",
			strokeLinejoin: "round",
			"aria-hidden": true,
			focusable: false
		};
		const IconBead = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "7",
					cy: "7",
					r: "3.6"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "13",
					cy: "7",
					r: "3.6"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "7",
					cy: "13",
					r: "3.6"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "13",
					cy: "13",
					r: "3.6",
					fill: "currentColor",
					stroke: "none"
				})
			]
		});
		const IconLogo = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			viewBox: "0 0 20 20",
			"aria-hidden": true,
			focusable: false,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "6.5",
					cy: "6.5",
					r: "4",
					fill: "#D7333B"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "13.5",
					cy: "6.5",
					r: "4",
					fill: "#F7C531"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "6.5",
					cy: "13.5",
					r: "4",
					fill: "#62B6E9"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "13.5",
					cy: "13.5",
					r: "4",
					fill: "#3E9C4A"
				}),
				[6.5, 13.5].flatMap((x) => [6.5, 13.5].map((y) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: x,
					cy: y,
					r: "1.3",
					fill: "rgba(0,0,0,.28)"
				}, `${x}${y}`)))
			]
		});
		const IconBack = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...base,
			...p,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12 4.5 6.5 10l5.5 5.5" })
		});
		const IconMore = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "5",
					cy: "10",
					r: "1",
					fill: "currentColor"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "10",
					cy: "10",
					r: "1",
					fill: "currentColor"
				}),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
					cx: "15",
					cy: "10",
					r: "1",
					fill: "currentColor"
				})
			]
		});
		const IconBrush = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M13.5 3.5 16.5 6.5 9 14l-3.5.5.5-3.5z" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M11.5 5.5l3 3" })]
		});
		const IconEraser = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 16h8" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3.8 11.8 11 4.6a1.4 1.4 0 0 1 2 0l2.4 2.4a1.4 1.4 0 0 1 0 2L9 15.4H6.6L3.8 12.6a.6.6 0 0 1 0-.8z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7.5 8.2l4.3 4.3" })
			]
		});
		const IconPicker = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12.5 4.5l3 3" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M14.2 3.2a1.8 1.8 0 0 1 2.6 2.6l-1.6 1.6-2.6-2.6z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12.4 6.2 5 13.6V16h2.4l7.4-7.4" })
			]
		});
		const IconFill = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 9.5 9.5 4l6 6-5.5 5.5a1.4 1.4 0 0 1-2 0L4 11.5a1.4 1.4 0 0 1 0-2z" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 10.5h11.5" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M16.5 13.5s1.2 1.6 1.2 2.4a1.2 1.2 0 0 1-2.4 0c0-.8 1.2-2.4 1.2-2.4z" })
			]
		});
		const IconUndo = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M7.5 5 4 8.5 7.5 12" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4.5 8.5h7a4 4 0 0 1 0 8H9" })]
		});
		const IconRedo = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M12.5 5 16 8.5 12.5 12" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M15.5 8.5h-7a4 4 0 0 0 0 8H11" })]
		});
		const IconTrash = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 6h12" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M8 6V4.5h4V6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.5 6l.8 9.6a1 1 0 0 0 1 .9h5.4a1 1 0 0 0 1-.9L14.5 6" })
			]
		});
		const IconSparkle = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 3v3M10 14v3M3 10h3M14 10h3" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", {
				d: "M10 6.5 11 9l2.5 1L11 11l-1 2.5L9 11l-2.5-1L9 9z",
				fill: "currentColor"
			})]
		});
		const IconGrid = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("rect", {
				x: "3.5",
				y: "3.5",
				width: "13",
				height: "13",
				rx: "2.5"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3.5 10h13M10 3.5v13" })]
		});
		const IconDownload = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 3.5v9M6 9l4 4 4-4" }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4 16.5h12" })]
		});
		const IconIron = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 14.5h13.5V12a5 5 0 0 0-5-5H6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M6 7v-2h6" }),
				/* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M3 14.5 5 9.5" })
			]
		});
		const IconCheck = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...base,
			strokeWidth: 2.4,
			...p,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M4.5 10.5 8.5 14.5 15.5 6" })
		});
		const IconClose = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("svg", {
			...base,
			...p,
			children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M5.5 5.5l9 9M14.5 5.5l-9 9" })
		});
		const IconAlert = (p) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("svg", {
			...base,
			...p,
			children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("circle", {
				cx: "10",
				cy: "10",
				r: "7"
			}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("path", { d: "M10 6.5v4.2M10 13.4v.1" })]
		});
		// src/client/ui/context.tsx
		const EnvContext = (0, react.createContext)(null);
		function useEnv() {
			const env = (0, react.useContext)(EnvContext);
			if (!env) throw new Error("dsh-pindou: EnvContext missing");
			return env;
		}
		/** The whole immutable game snapshot; components derive what they need. */
		function useGame() {
			const { store } = useEnv();
			return (0, react.useSyncExternalStore)(store.subscribe, store.getSnapshot, store.getSnapshot);
		}
		function prefersReducedMotion() {
			return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
		}
		function isDark(doc = document) {
			return doc.body?.hasAttribute("data-ds-dark-theme") ?? false;
		}
		function cx(...parts) {
			return parts.filter(Boolean).join(" ");
		}
		// src/client/entry.tsx
		/**
		* Session-header entry: a 32 px bead button that opens the `pindou` tab.
		* While the session's model is running (and the pref is on) it shows a
		* breathing dot, and — at most twice per session, never stealing focus — a
		* small "趁现在拼一个？" bubble below the button, portaled to document.body.
		*/
		const HINT_MS = 8e3;
		const shown = /* @__PURE__ */ new Map();
		function makeEntry(deps) {
			return function PindouEntry(props) {
				const t = deps.useT();
				const running = props.useSessionStatus ? props.useSessionStatus((m) => m.get(props.sessionId ?? "")?.running === true) : props.useSession ? props.useSession((s) => s?.running === true) : false;
				const busyHint = (0, react.useSyncExternalStore)(deps.store.subscribe, () => deps.store.getSnapshot().prefs.busyHint);
				const busy = running && busyHint;
				const btn = (0, react.useRef)(null);
				const [hint, setHint] = (0, react.useState)(false);
				(0, react.useEffect)(() => {
					if (!busy) {
						setHint(false);
						return;
					}
					const key = props.sessionId ?? "";
					const count = shown.get(key) ?? 0;
					if (count >= 2 || deps.panelVisible()) return;
					shown.set(key, count + 1);
					setHint(true);
					const id = setTimeout(() => {
						setHint(false);
					}, HINT_MS);
					return () => {
						clearTimeout(id);
					};
				}, [busy, props.sessionId]);
				const open = () => {
					setHint(false);
					deps.open();
				};
				return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
					ref: btn,
					type: "button",
					className: cx("pd-entry", "pd-portal", busy && "pd-busy"),
					"aria-label": busy ? t("entryBusyLabel") : t("entryLabel"),
					title: t("entryLabel"),
					onClick: open,
					children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconBead, {}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "pd-dot",
						"aria-hidden": true
					})]
				}), hint ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Hint, {
					anchor: btn,
					t,
					onOpen: open,
					onClose: () => {
						setHint(false);
					}
				}) : null] });
			};
		}
		function Hint({ anchor, t, onOpen, onClose }) {
			const [pos, setPos] = (0, react.useState)(null);
			(0, react.useLayoutEffect)(() => {
				const place = () => {
					const r = anchor.current?.getBoundingClientRect();
					if (!r || r.width === 0) {
						setPos(null);
						return;
					}
					const vw = document.documentElement.clientWidth;
					setPos({
						top: Math.round(r.bottom + 8),
						right: Math.max(8, Math.round(vw - r.right - 4))
					});
				};
				place();
				window.addEventListener("resize", place);
				window.addEventListener("scroll", place, true);
				return () => {
					window.removeEventListener("resize", place);
					window.removeEventListener("scroll", place, true);
				};
			}, [anchor]);
			if (!pos || typeof document === "undefined") return null;
			return (0, react_dom.createPortal)(/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-portal pd-hint",
				role: "status",
				style: {
					top: pos.top,
					right: pos.right
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "pd-mini",
						"aria-hidden": true,
						children: [
							4,
							2,
							8
						].map((i) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { background: PALETTE[i].hex } }, i))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("hintText") }),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "pd-go",
						tabIndex: -1,
						onClick: onOpen,
						children: t("hintGo")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "pd-x",
						tabIndex: -1,
						"aria-label": t("hintClose"),
						onClick: onClose,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconClose, {})
					})
				]
			}), document.body);
		}
		// src/client/game-store.ts
		/**
		* The game's single source of truth: a tiny external store (useSyncExternalStore
		* friendly) over the pure core. No React, no DOM: everything environmental
		* (storage, network, clock, motion preference) is injected so tests drive it.
		*/
		const AI_SIZES = [12, 16];
		/** Matches the designer's --bb-iron-total (the sweep and the staggered melt). */
		const IRON_MS = 1200;
		function resolveTarget(target) {
			if (target === null) return null;
			const template = findTemplate(target);
			if (template) return template.board;
			const m = /^ai:(\d+):([.0-9a-f]+)$/.exec(target);
			if (!m) return null;
			const size = Number(m[1]);
			if (!isBoardSize(size)) return null;
			const decoded = decode(m[2], size);
			return decoded.ok ? decoded.board : null;
		}
		/** The colour with the most beads still missing, so a fresh pattern starts on something useful. */
		function firstColor(board, target, fallback) {
			let best = fallback;
			let most = 0;
			for (const [c, n] of remainingByColor(board, target)) if (n > most) {
				most = n;
				best = c;
			}
			return best;
		}
		var GameStore = class {
			deps;
			state;
			listeners = /* @__PURE__ */ new Set();
			cache;
			now;
			st;
			ct;
			saveHandle = null;
			ironHandle = null;
			aiAbort = null;
			last = null;
			disposed = false;
			lastGenAt = Number.NEGATIVE_INFINITY;
			constructor(deps) {
				this.deps = deps;
				this.now = deps.now ?? Date.now;
				this.st = deps.setTimeout ?? ((fn, ms) => setTimeout(fn, ms));
				this.ct = deps.clearTimeout ?? ((h) => {
					clearTimeout(h);
				});
				this.cache = new GenerationCache(deps.store);
				const saved = deps.store.loadState();
				let targetBoard = resolveTarget(saved.target);
				let target = targetBoard ? saved.target : null;
				if (targetBoard && targetBoard.size !== saved.board.size) {
					target = null;
					targetBoard = null;
				}
				const storage = deps.store.status;
				this.state = {
					history: createHistory(saved.board),
					color: saved.color,
					tool: saved.tool,
					mode: saved.mode,
					target,
					targetBoard,
					ironed: saved.ironed,
					ironingSince: null,
					celebrateAt: null,
					overlay: saved.ironed ? "result" : null,
					toast: storage === "ok" ? null : {
						key: storage === "recovered" ? "storageRecovered" : "storageUnavailable",
						undo: false,
						at: this.now()
					},
					prefs: saved.prefs,
					done: saved.done,
					coached: saved.coached,
					storage,
					ai: {
						phase: "idle",
						prompt: "",
						size: 16
					}
				};
			}
			getSnapshot = () => this.state;
			subscribe = (fn) => {
				this.listeners.add(fn);
				return () => {
					this.listeners.delete(fn);
				};
			};
			set(patch, persist = true) {
				if (this.disposed) return;
				this.state = {
					...this.state,
					...patch
				};
				if (persist) this.scheduleSave();
				for (const fn of Array.from(this.listeners)) fn();
			}
			setAi(patch) {
				this.set({ ai: {
					...this.state.ai,
					...patch
				} }, false);
			}
			get board() {
				return this.state.history.present;
			}
			get locked() {
				return this.state.ironed || this.state.ironingSince !== null;
			}
			get canUndo() {
				return !this.locked && canUndo(this.state.history);
			}
			get canRedo() {
				return !this.locked && canRedo(this.state.history);
			}
			saved() {
				const s = this.state;
				return {
					board: s.history.present,
					color: s.color,
					tool: s.tool,
					mode: s.mode,
					target: s.target,
					ironed: s.ironed || s.ironingSince !== null,
					prefs: s.prefs,
					done: s.done,
					coached: s.coached
				};
			}
			scheduleSave() {
				if (this.saveHandle !== null) return;
				this.saveHandle = this.st(() => {
					this.saveHandle = null;
					this.flush();
				}, this.deps.saveDelayMs ?? 300);
			}
			flush() {
				if (this.saveHandle !== null) {
					this.ct(this.saveHandle);
					this.saveHandle = null;
				}
				const before = this.deps.store.status;
				this.deps.store.saveState(this.saved());
				const after = this.deps.store.status;
				if (after !== before && !this.disposed) this.set({
					storage: after,
					toast: {
						key: "storageUnavailable",
						undo: false,
						at: this.now()
					}
				}, false);
			}
			dispose() {
				this.flush();
				this.aiAbort?.abort();
				if (this.ironHandle !== null) this.ct(this.ironHandle);
				this.disposed = true;
				this.listeners.clear();
			}
			go(mode) {
				if (mode === this.state.mode) return;
				this.last = null;
				this.set({
					mode,
					overlay: mode === "play" ? this.state.overlay : null
				});
			}
			/** Free play: a blank board unless a free board is already in progress. */
			startFree() {
				const s = this.state;
				const fresh = s.target !== null || s.ironed;
				this.set({
					mode: "play",
					...fresh ? { history: push(commit(s.history), createBoard(s.history.present.size)) } : {},
					target: null,
					targetBoard: null,
					ironed: false,
					celebrateAt: null,
					overlay: s.coached ? null : "coach"
				});
			}
			setPrefs(patch) {
				this.set({ prefs: {
					...this.state.prefs,
					...patch
				} });
			}
			dismissOverlay() {
				const coach = this.state.overlay === "coach";
				this.set({
					overlay: null,
					...coach ? { coached: true } : {}
				}, coach);
			}
			/** Menu → "show the intro again": opens the coach card on the board. */
			showCoach() {
				this.set({
					mode: "play",
					overlay: "coach"
				}, false);
			}
			showToast(key, undoable = false) {
				this.set({ toast: {
					key,
					undo: undoable,
					at: this.now()
				} }, false);
			}
			hideToast() {
				if (this.state.toast) this.set({ toast: null }, false);
			}
			setColor(color) {
				if (!isColorIndex(color)) return;
				this.set({
					color,
					tool: this.state.tool === "erase" || this.state.tool === "pick" ? "paint" : this.state.tool
				});
			}
			setTool(tool) {
				this.set({ tool });
			}
			/** Begin a stroke (pointer down). `override` forces a tool (right button = erase, Alt = pick). */
			strokeStart(x, y, override) {
				if (this.locked) {
					this.showToast("locked");
					return;
				}
				if (!inBounds(this.board, x, y)) return;
				const tool = override ?? this.state.tool;
				if (tool === "pick") {
					this.pick(x, y);
					return;
				}
				if (tool === "fill") {
					const next = floodFill(this.board, x, y, this.state.color);
					if (next !== this.board) {
						this.set({ history: push(commit(this.state.history), next) });
						this.afterChange();
					}
					return;
				}
				const value = tool === "erase" ? -1 : this.state.color;
				this.last = {
					x,
					y,
					value
				};
				this.set({
					history: preview(begin(this.state.history), setCell(this.board, x, y, value)),
					overlay: null
				});
			}
			strokeMove(x, y) {
				const last = this.last;
				if (last === null || this.locked) return;
				const cx = Math.max(0, Math.min(this.board.size - 1, x));
				const cy = Math.max(0, Math.min(this.board.size - 1, y));
				if (cx === last.x && cy === last.y) return;
				const next = paintLine(this.board, last.x, last.y, cx, cy, last.value);
				this.last = {
					x: cx,
					y: cy,
					value: last.value
				};
				if (next !== this.board) this.set({ history: preview(this.state.history, next) });
			}
			strokeEnd() {
				if (this.last === null) return;
				this.last = null;
				this.set({ history: commit(this.state.history) });
				this.afterChange();
			}
			get stroking() {
				return this.last !== null;
			}
			/** One-shot action at a cell (keyboard). */
			applyAt(x, y, override) {
				this.strokeStart(x, y, override);
				this.strokeEnd();
			}
			pick(x, y) {
				const c = getCell(this.board, x, y);
				if (c !== -1) this.set({
					color: c,
					tool: "paint"
				});
			}
			undo() {
				if (this.state.ironed && this.state.ironingSince === null) {
					this.unIron();
					return;
				}
				if (!this.canUndo) return;
				this.last = null;
				this.set({ history: undo(this.state.history) });
				this.afterChange();
			}
			redo() {
				if (!this.canRedo) return;
				this.last = null;
				this.set({ history: redo(this.state.history) });
				this.afterChange();
			}
			clear() {
				if (this.locked || this.board.cells.every((c) => c === -1)) return;
				this.set({
					history: push(commit(this.state.history), clearBoard(this.board)),
					celebrateAt: null,
					overlay: null
				});
				this.showToast("cleared", true);
			}
			resize(size) {
				if (this.locked || size === this.board.size) return;
				const keepTarget = this.state.targetBoard?.size === size;
				this.set({
					history: push(commit(this.state.history), resizeBoard(this.board, size)),
					...keepTarget ? {} : {
						target: null,
						targetBoard: null
					}
				});
			}
			/** Completion bookkeeping after any committed change. */
			afterChange() {
				const target = this.state.targetBoard;
				if (!target) return;
				const done = completion(this.board, target).done;
				if (done && this.state.celebrateAt === null) this.set({
					celebrateAt: this.now(),
					overlay: "done"
				}, false);
				else if (!done && this.state.celebrateAt !== null) this.set({
					celebrateAt: null,
					overlay: this.state.overlay === "done" ? null : this.state.overlay
				}, false);
			}
			/** Start following a pattern on a fresh board of its size (undoable). */
			follow(target) {
				const board = resolveTarget(target);
				if (!board) return;
				const fresh = createBoard(board.size);
				this.last = null;
				this.set({
					mode: "play",
					history: push(commit(this.state.history), fresh),
					target,
					targetBoard: board,
					ironed: false,
					ironingSince: null,
					celebrateAt: null,
					color: firstColor(fresh, board, this.state.color),
					tool: "paint",
					overlay: this.state.coached ? null : "coach"
				});
			}
			leaveTarget() {
				this.set({
					target: null,
					targetBoard: null,
					celebrateAt: null
				});
			}
			/** Put every pattern bead in place (AI patterns: "fill board"). Undoable. */
			fillTarget() {
				const target = this.state.targetBoard;
				if (!target || this.locked) return;
				const cells = this.board.cells.map((c, i) => target.cells[i] === -1 ? c : target.cells[i]);
				this.set({ history: push(commit(this.state.history), {
					size: this.board.size,
					cells: Object.freeze(cells)
				}) });
				this.afterChange();
			}
			iron() {
				if (this.locked || this.board.cells.every((c) => c === -1)) return;
				const finish = () => {
					this.ironHandle = null;
					const t = this.state.target;
					const done = t !== null && findTemplate(t) !== void 0 && this.state.celebrateAt !== null && !this.state.done.includes(t) ? [...this.state.done, t] : this.state.done;
					this.set({
						ironed: true,
						ironingSince: null,
						overlay: "result",
						done
					});
				};
				this.last = null;
				this.set({
					history: commit(this.state.history),
					overlay: null
				});
				if (this.deps.reducedMotion?.() ?? false) {
					finish();
					return;
				}
				this.set({ ironingSince: this.now() }, false);
				this.ironHandle = this.st(finish, IRON_MS);
			}
			unIron() {
				if (this.state.ironingSince !== null || !this.state.ironed) return;
				this.set({
					ironed: false,
					overlay: null
				});
			}
			/** "Make another": back to the start page with the ironed piece kept for undo. */
			again() {
				this.set({
					mode: "home",
					overlay: null
				});
			}
			setAiPrompt(prompt) {
				this.setAi({
					prompt: prompt.slice(0, 120),
					...this.state.ai.phase === "error" ? {
						phase: "idle",
						error: void 0
					} : {}
				});
			}
			setAiSize(size) {
				this.setAi({ size });
			}
			async probeStatus() {
				if (!this.deps.api) {
					this.setAi({ status: {
						configured: false,
						route: "none"
					} });
					return;
				}
				try {
					this.setAi({ status: await this.deps.api.status(AbortSignal.timeout(8e3)) });
				} catch {
					this.setAi({ status: void 0 });
				}
			}
			cancelGenerate() {
				this.aiAbort?.abort();
				this.aiAbort = null;
				if (this.state.ai.phase === "loading") this.setAi({ phase: "idle" });
			}
			async generate() {
				if (this.state.ai.phase === "loading") return;
				const prompt = sanitizePrompt(this.state.ai.prompt);
				const size = this.state.ai.size;
				if (prompt === "") {
					this.setAi({
						phase: "error",
						error: "empty"
					});
					return;
				}
				const key = promptKey(prompt, size);
				const hit = this.cache.get(key);
				if (hit) {
					const decoded = decode(hit.flat, hit.size);
					if (decoded.ok) {
						this.finishAi({
							board: decoded.board,
							prompt,
							cached: true,
							repaired: false,
							truncated: false,
							model: hit.model
						});
						return;
					}
				}
				if (!this.deps.api) {
					this.setAi({
						phase: "error",
						error: "not-configured"
					});
					return;
				}
				if (this.now() - this.lastGenAt < 5e3) {
					this.setAi({
						phase: "error",
						error: "rate"
					});
					return;
				}
				this.lastGenAt = this.now();
				const abort = new AbortController();
				this.aiAbort = abort;
				this.setAi({
					phase: "loading",
					error: void 0
				});
				let reply;
				try {
					reply = await this.deps.api.generate({
						prompt,
						size
					}, abort.signal);
				} catch {
					if (abort.signal.aborted || this.disposed) return;
					this.aiAbort = null;
					this.setAi({
						phase: "error",
						error: "network"
					});
					return;
				}
				if (abort.signal.aborted || this.disposed) return;
				this.aiAbort = null;
				if (!reply.ok) {
					const error = {
						"not-configured": "not-configured",
						busy: "busy",
						"rate-limited": "rate",
						parse: "parse",
						timeout: "timeout"
					}[reply.error] ?? "network";
					this.setAi({
						phase: "error",
						error,
						...error === "not-configured" ? { status: {
							configured: false,
							route: "none"
						} } : {}
					});
					return;
				}
				const decoded = reply.size === size && typeof reply.flat === "string" ? decode(reply.flat, size) : void 0;
				if (!decoded?.ok) {
					this.setAi({
						phase: "error",
						error: "parse"
					});
					return;
				}
				if (decoded.board.cells.every((c) => c === -1)) {
					this.setAi({
						phase: "error",
						error: "parse"
					});
					return;
				}
				this.cache.put({
					key,
					size,
					flat: encode(decoded.board),
					model: reply.model,
					at: this.now()
				});
				this.finishAi({
					board: decoded.board,
					prompt,
					usage: reply.usage,
					cached: false,
					repaired: reply.repaired === true,
					truncated: reply.finish === "max-tokens",
					model: typeof reply.model === "string" ? reply.model.slice(0, 80) : void 0
				});
			}
			/** A generated pattern becomes the faint guide on a fresh board, like a template. */
			finishAi(result) {
				this.setAi({
					phase: "done",
					error: void 0,
					result
				});
				this.follow(`ai:${result.board.size}:${encode(result.board)}`);
			}
		};
		// src/client/styles.ts
		/**
		* All plugin CSS in one place. The host renders plugin React inline with no
		* CSS isolation, so every class and custom property carries the `pd-` prefix
		* and every rule is scoped under `.pd-root` (or a `pd-` class for portals).
		*
		* Tokens follow the designer's spec (/workspace/bead-break/spec.md §12,
		* tokens.css), renamed from `--bb-*` to `--pd-*`. Only `--dsw-alias-*` host
		* aliases are read, each with a fallback; bead colours never change with theme.
		*/
		const STYLE_ID = "dsh-pindou-styles";
		const CSS = "\n@property --pd-hole { syntax: '<percentage>'; inherits: true; initial-value: 20%; }\n@property --pd-hl   { syntax: '<number>';     inherits: true; initial-value: 0.6; }\n@property --pd-lt   { syntax: '<percentage>'; inherits: true; initial-value: 20%; }\n@property --pd-dk   { syntax: '<percentage>'; inherits: true; initial-value: 28%; }\n\n.pd-root, .pd-portal {\n  --pd-bg: var(--dsw-alias-bg-base, #FFFFFF);\n  --pd-surface: var(--dsw-alias-bg-module-platform, #F5F6F7);\n  --pd-surface-raised: var(--dsw-alias-bg-layer-1, #FFFFFF);\n  --pd-border: var(--dsw-alias-border-l2, rgba(0,0,0,.10));\n  --pd-border-subtle: var(--dsw-alias-border-l1, rgba(0,0,0,.04));\n  --pd-text: var(--dsw-alias-label-primary, #0F1115);\n  --pd-text-2: var(--dsw-alias-label-secondary, #61666B);\n  --pd-text-3: var(--dsw-alias-label-tertiary, #81858C);\n  --pd-hover: var(--dsw-alias-interactive-bg-hover, rgba(38,49,72,.06));\n  --pd-active: var(--dsw-alias-interactive-bg-active, rgba(38,49,72,.10));\n  --pd-accent: var(--dsw-alias-state-business-primary, #4176E6);\n  --pd-accent-soft: var(--dsw-alias-state-business-tertiary, #E4EDFD);\n  --pd-primary-fill: var(--dsw-alias-button-primary-fill, #0F1115);\n  --pd-primary-label: var(--dsw-alias-label-primary-inverted, #FFFFFF);\n  --pd-toast-bg: var(--dsw-alias-toast-bg, #0F1115);\n  --pd-toast-label: var(--dsw-alias-toast-label, #FFFFFF);\n  --pd-danger: #E5484D;\n  --pd-success: #2BA24C;\n  --pd-warm: #F5A524;\n  --pd-board: #EEF0F3;\n  --pd-board-edge: rgba(0,0,0,.06);\n  --pd-peg: #D3D8DF;\n  --pd-ghost-alpha: .30;\n  --pd-ghost-hot: .62;\n  --pd-cursor: var(--pd-accent);\n  --pd-pad: 16px; --pd-gap: 12px;\n  --pd-header-h: 44px; --pd-status-h: 36px; --pd-toolbar-h: 36px; --pd-footer-h: 40px;\n  --pd-swatch: 28px; --pd-swatch-gap: 8px; --pd-hit: 32px;\n  --pd-board-pad: 6px; --pd-bead-inset: 6%;\n  --pd-radius-board: var(--dsw-radius-md, 12px);\n  --pd-radius-card: var(--dsw-radius-md, 12px);\n  --pd-radius-ctl: var(--dsw-radius-sm, 8px);\n  --pd-entry: 32px;\n  --pd-ease: cubic-bezier(.4,0,.2,1);\n  --pd-ease-spring: cubic-bezier(.34,1.56,.64,1);\n  --pd-ease-out: cubic-bezier(.22,1,.36,1);\n  --pd-t-fast: 100ms; --pd-t: 200ms; --pd-t-slow: 300ms;\n  --pd-t-place: 120ms; --pd-t-erase: 90ms;\n  --pd-t-iron-cell: 420ms; --pd-t-iron-total: 1200ms;\n  --pd-t-celebrate: 1400ms; --pd-t-hint: 8000ms;\n  --pd-font-code: var(--ds-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);\n  --pd-bead-0:#F6F4EE; --pd-bead-1:#F2DFA7; --pd-bead-2:#F7C531; --pd-bead-3:#F08A24;\n  --pd-bead-4:#D7333B; --pd-bead-5:#F39DC1; --pd-bead-6:#8A5BB5; --pd-bead-7:#2D4FA0;\n  --pd-bead-8:#62B6E9; --pd-bead-9:#24A79A; --pd-bead-a:#3E9C4A; --pd-bead-b:#A9D46A;\n  --pd-bead-c:#87573A; --pd-bead-d:#D7A473; --pd-bead-e:#9DA1A8; --pd-bead-f:#26272B;\n}\nbody[data-ds-dark-theme] .pd-root, body[data-ds-dark-theme] .pd-portal {\n  --pd-danger: #FF6369; --pd-success: #46C267;\n  --pd-board: #1C1D20; --pd-board-edge: rgba(255,255,255,.08); --pd-peg: #34373D;\n  --pd-ghost-alpha: .34; --pd-ghost-hot: .70;\n}\n@media (pointer: coarse) { .pd-root { --pd-hit: 36px; } }\n\n.pd-entry{width:var(--pd-entry);height:var(--pd-entry);border-radius:var(--pd-radius-ctl);border:0;background:transparent;display:inline-grid;place-items:center;cursor:pointer;color:var(--pd-text-2);position:relative;padding:0;transition:background var(--pd-t-fast),color var(--pd-t-fast)}\n.pd-entry:hover{background:var(--pd-hover);color:var(--pd-text)}\n.pd-entry[aria-expanded=true]{background:var(--pd-accent-soft);color:var(--pd-accent)}\n.pd-entry:focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}\n.pd-entry svg{width:18px;height:18px}\n.pd-entry .pd-dot{position:absolute;top:5px;right:5px;width:6px;height:6px;border-radius:50%;background:var(--pd-warm);box-shadow:0 0 0 2px var(--dsw-alias-bg-layer-1,#fff);opacity:0;transform:scale(.4);transition:opacity var(--pd-t),transform var(--pd-t)}\n.pd-entry.pd-has-progress .pd-dot,.pd-entry.pd-busy .pd-dot{opacity:1;transform:none}\n.pd-entry.pd-busy .pd-dot{animation:pd-breathe 1.4s var(--pd-ease) infinite}\n@keyframes pd-breathe{0%,100%{opacity:1}50%{opacity:.35}}\n.pd-hint{position:fixed;z-index:2147483000;white-space:nowrap;background:var(--pd-surface-raised);color:var(--pd-text);border:1px solid var(--pd-border);border-radius:12px;padding:6px 6px 6px 12px;display:flex;align-items:center;gap:6px;font-size:13px;line-height:1.4;font-family:inherit;box-shadow:0 6px 20px rgba(0,0,0,.10);animation:pd-hint-in var(--pd-t) var(--pd-ease)}\n.pd-hint::before{content:\"\";position:absolute;top:-5px;right:var(--pd-arrow,14px);width:9px;height:9px;background:inherit;border-left:1px solid var(--pd-border);border-top:1px solid var(--pd-border);transform:rotate(45deg)}\n@keyframes pd-hint-in{from{opacity:0;transform:translateY(-4px) scale(.98)}}\n.pd-hint .pd-mini{display:inline-flex;gap:2px}\n.pd-hint .pd-mini i{width:7px;height:7px;border-radius:50%;display:block}\n.pd-hint .pd-go{border:0;background:var(--pd-accent-soft);color:var(--pd-accent);border-radius:8px;padding:0 10px;height:28px;font:inherit;font-size:12.5px;cursor:pointer;font-weight:500}\n.pd-hint .pd-x{border:0;background:transparent;width:28px;height:28px;border-radius:6px;cursor:pointer;color:var(--pd-text-3);display:grid;place-items:center;padding:0}\n.pd-hint .pd-x:hover{background:var(--pd-hover)}\n\n.pd-root{container:pd/inline-size;position:relative;height:100%;min-height:0;display:flex;flex-direction:column;background:var(--pd-bg);color:var(--pd-text);font-size:14px;line-height:1.45;-webkit-font-smoothing:antialiased;padding:0 env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);box-sizing:border-box}\n.pd-root *,.pd-root *::before,.pd-root *::after,.pd-portal *{box-sizing:border-box}\n.pd-root button{font:inherit;color:inherit}\n.pd-root [hidden]{display:none!important}\n.pd-root :focus-visible{outline:2px solid var(--pd-accent);outline-offset:2px}\n.pd-sr{position:absolute!important;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;margin:-1px}\n.pd-head{height:var(--pd-header-h);flex:none;display:flex;align-items:center;gap:4px;padding:0 8px 0 12px;border-bottom:1px solid var(--pd-border-subtle)}\n.pd-head h2{font-size:14px;font-weight:600;margin:0;display:flex;align-items:center;gap:8px;flex:1;min-width:0;white-space:nowrap}\n.pd-head h2 .pd-logo{width:18px;height:18px;flex:none}\n.pd-head h2 small{font-weight:400;color:var(--pd-text-3);font-size:12px;overflow:hidden;text-overflow:ellipsis}\n.pd-ib{width:var(--pd-hit);height:var(--pd-hit);border-radius:var(--pd-radius-ctl);border:0;background:transparent;display:grid;place-items:center;cursor:pointer;color:var(--pd-text-2);flex:none;padding:0;transition:background var(--pd-t-fast)}\n.pd-ib:hover{background:var(--pd-hover);color:var(--pd-text)}\n.pd-ib:disabled{opacity:.35;cursor:default;background:transparent}\n.pd-ib svg{width:16px;height:16px}\n.pd-scroll{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;overscroll-behavior:contain}\n.pd-view{max-width:480px;margin:0 auto;padding:12px var(--pd-pad) var(--pd-pad);display:flex;flex-direction:column;animation:pd-view-in var(--pd-t) var(--pd-ease)}\n@keyframes pd-view-in{from{opacity:0;transform:translateX(8px)}}\n/* start page */\n.pd-start{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}\n.pd-big{border:1px solid var(--pd-border);background:var(--pd-surface-raised);border-radius:var(--pd-radius-card);padding:12px;text-align:left;cursor:pointer;display:flex;flex-direction:column;gap:6px;min-height:64px;transition:background var(--pd-t-fast),transform var(--pd-t-fast)}\n.pd-big:hover{background:var(--pd-hover)}\n.pd-big:active{transform:scale(.98)}\n.pd-big .pd-ic{width:28px;height:28px;border-radius:8px;display:grid;place-items:center;background:var(--pd-surface)}\n.pd-big .pd-ic svg{width:16px;height:16px}\n.pd-big b{font-size:13.5px;font-weight:600}\n.pd-big span{font-size:12px;color:var(--pd-text-3)}\n.pd-sec{font-size:12px;color:var(--pd-text-3);margin:0 0 8px;font-weight:500;display:flex;justify-content:space-between}\n.pd-tpls{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;list-style:none;margin:0;padding:0}\n.pd-tpl{width:100%;border:1px solid var(--pd-border-subtle);background:var(--pd-surface);border-radius:var(--pd-radius-card);padding:8px 6px;cursor:pointer;display:flex;flex-direction:column;align-items:center;gap:6px;position:relative;transition:background var(--pd-t-fast),transform var(--pd-t-fast),box-shadow var(--pd-t-fast)}\n.pd-tpl:hover{background:var(--pd-hover);box-shadow:0 0 0 1px var(--pd-border)}\n.pd-tpl:active{transform:scale(.97)}\n.pd-tpl canvas{width:56px;height:56px}\n.pd-tpl .pd-nm{font-size:12px;font-weight:500}\n.pd-tpl .pd-meta{font-size:10.5px;color:var(--pd-text-3);display:flex;gap:4px;align-items:center}\n.pd-diff{display:inline-flex;gap:2px}.pd-diff i{width:4px;height:4px;border-radius:50%;background:var(--pd-border)}.pd-diff i.pd-on{background:var(--pd-text-2)}\n.pd-tpl .pd-done{position:absolute;top:6px;right:6px;width:14px;height:14px;border-radius:50%;background:var(--pd-success);color:#fff;display:grid;place-items:center}\n.pd-tpl .pd-done svg{width:9px;height:9px}\n/* status line */\n.pd-status{min-height:var(--pd-status-h);flex:none;display:flex;flex-direction:column;justify-content:center;gap:6px;margin-top:-4px}\n.pd-status .pd-line{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--pd-text-2);min-height:20px;flex-wrap:wrap}\n.pd-status .pd-line strong{color:var(--pd-text);font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:50%}\n.pd-status .pd-r{margin-left:auto;font-variant-numeric:tabular-nums;color:var(--pd-text-3)}\n.pd-status .pd-warn{color:var(--pd-danger)}\n.pd-prog{height:4px;border-radius:2px;background:var(--pd-surface);overflow:hidden}\n.pd-prog i{display:block;height:100%;border-radius:2px;background:var(--pd-accent);transition:width var(--pd-t-slow) var(--pd-ease-out),background var(--pd-t)}\n.pd-prog.pd-full i{background:var(--pd-success)}\n.pd-seg{display:inline-flex;background:var(--pd-surface);border-radius:7px;padding:2px;gap:2px}\n.pd-seg button{border:0;background:transparent;font-size:11.5px;min-width:32px;height:24px;padding:0 7px;border-radius:5px;cursor:pointer;color:var(--pd-text-2);font-variant-numeric:tabular-nums}\n.pd-seg button[aria-pressed=true]{background:var(--pd-surface-raised);color:var(--pd-text);box-shadow:0 1px 2px rgba(0,0,0,.08)}\n.pd-seg button:disabled{opacity:.4;cursor:default}\n.pd-tokens{font-size:11.5px;color:var(--pd-text-3);display:inline-flex;align-items:center;gap:4px;font-variant-numeric:tabular-nums}\n.pd-shimmer{background:linear-gradient(90deg,var(--pd-text-3) 0%,var(--pd-text) 45%,var(--pd-text-3) 90%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:pd-shim 1.6s linear infinite}\n@keyframes pd-shim{from{background-position:100% 0}to{background-position:-100% 0}}\n.pd-link{border:0;background:transparent;color:var(--pd-accent);cursor:pointer;font-size:12.5px;padding:0 4px;min-height:24px}\n\n.pd-boardwrap{position:relative;margin-top:4px;display:flex;justify-content:center}\n.pd-board{--pd-cell:17px;position:relative;display:grid;grid-template-columns:repeat(var(--pd-n),var(--pd-cell));grid-auto-rows:var(--pd-cell);padding:var(--pd-board-pad);background:var(--pd-board);border-radius:var(--pd-radius-board);box-shadow:inset 0 0 0 1px var(--pd-board-edge);touch-action:none;user-select:none;-webkit-user-select:none;-webkit-touch-callout:none;outline:none;cursor:default;transition:background var(--pd-t-slow),box-shadow var(--pd-t-slow)}\n.pd-board:focus-visible{box-shadow:inset 0 0 0 1px var(--pd-board-edge),0 0 0 2px var(--pd-accent)}\n.pd-board.pd-tool-pick{cursor:crosshair}\n.pd-board.pd-tool-erase{cursor:cell}\n.pd-row{display:contents}\n.pd-cell{position:relative}\n.pd-cell::before{content:\"\";position:absolute;left:50%;top:50%;width:22%;height:22%;margin:-11% 0 0 -11%;border-radius:50%;background:var(--pd-peg);transition:opacity var(--pd-t-slow)}\n.pd-cell.pd-g::after{content:attr(data-code);position:absolute;inset:14%;border-radius:50%;background:var(--pd-gc);opacity:var(--pd-ghost-alpha);display:grid;place-items:center;font:600 calc(var(--pd-cell)*.42)/1 var(--pd-font-code);color:transparent;transition:opacity var(--pd-t)}\n.pd-root.pd-codes .pd-cell.pd-g::after{color:var(--pd-gl)}\n.pd-cell.pd-g.pd-hot::after{opacity:var(--pd-ghost-hot)}\n.pd-board.pd-pulse .pd-cell.pd-g.pd-hot::after{animation:pd-hot 520ms var(--pd-ease) 2}\n@keyframes pd-hot{0%,100%{transform:scale(1)}50%{transform:scale(.72)}}\n.pd-board.pd-noguide .pd-cell.pd-g::after{opacity:0}\n.pd-bead{position:absolute;inset:var(--pd-bead-inset);border-radius:50%;z-index:1;\n  background:\n    radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--pd-c) 52%,#000) 0 var(--pd-hole),transparent calc(var(--pd-hole) + 3%)),\n    radial-gradient(circle at 34% 28%,rgb(255 255 255 / calc(var(--pd-hl) * .9)) 0 9%,rgb(255 255 255 / 0) 30%),\n    radial-gradient(circle at 42% 38%,color-mix(in srgb,var(--pd-c) calc(100% - var(--pd-lt)),#fff) 0%,var(--pd-c) 46%,color-mix(in srgb,var(--pd-c) calc(100% - var(--pd-dk)),#000) 100%);\n  box-shadow:0 1px 1.5px rgba(0,0,0,.28),inset 0 0 0 .5px rgba(0,0,0,.14);\n  animation:pd-place var(--pd-t-place) var(--pd-ease-spring);\n  transition:inset var(--pd-t-iron-cell) var(--pd-ease-out) var(--pd-d,0ms),border-radius var(--pd-t-iron-cell) var(--pd-ease-out) var(--pd-d,0ms),--pd-hole var(--pd-t-iron-cell) var(--pd-ease-out) var(--pd-d,0ms),--pd-hl var(--pd-t-iron-cell) var(--pd-ease) var(--pd-d,0ms),--pd-lt var(--pd-t-iron-cell) var(--pd-ease) var(--pd-d,0ms),--pd-dk var(--pd-t-iron-cell) var(--pd-ease) var(--pd-d,0ms),box-shadow var(--pd-t-iron-cell) var(--pd-d,0ms),filter var(--pd-t-iron-cell) var(--pd-d,0ms)}\n.pd-bead.pd-still{animation:none}\n@keyframes pd-place{0%{transform:scale(.6)}100%{transform:scale(1)}}\n.pd-cell.pd-wrong .pd-bead{outline:1.5px dashed var(--pd-danger);outline-offset:-1px}\n.pd-board.pd-kbd:focus-visible .pd-cell.pd-cur{outline:2px solid var(--pd-cursor);outline-offset:0;border-radius:30%;z-index:3}\n.pd-board.pd-thinking .pd-cell::before{animation:pd-peg 1.4s var(--pd-ease) infinite;animation-delay:calc(var(--pd-i) * 9ms)}\n@keyframes pd-peg{0%,100%{opacity:1}50%{opacity:.25}}\n.pd-board.pd-ironed{background:transparent;box-shadow:none;filter:drop-shadow(0 1px 1.5px rgba(0,0,0,.22))}\n.pd-board.pd-ironed .pd-cell::before,.pd-board.pd-ironed .pd-cell.pd-g::after{opacity:0}\n.pd-board.pd-ironed .pd-bead{inset:-.5px;border-radius:var(--pd-rtl,0) var(--pd-rtr,0) var(--pd-rbr,0) var(--pd-rbl,0);--pd-hole:0%;--pd-hl:.16;--pd-lt:6%;--pd-dk:8%;box-shadow:inset 0 0 0 .5px rgba(0,0,0,.05);filter:saturate(.94)}\n.pd-sweep{position:absolute;inset:0;pointer-events:none;border-radius:var(--pd-radius-board);overflow:hidden;z-index:4}\n.pd-sweep::before{content:\"\";position:absolute;width:60%;height:300%;left:-80%;top:-100%;transform:rotate(35deg);background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--pd-warm) 38%,transparent) 45%,rgb(255 255 255 / .35) 50%,color-mix(in srgb,var(--pd-warm) 38%,transparent) 55%,transparent);animation:pd-sweep var(--pd-t-iron-total) var(--pd-ease) forwards}\n@keyframes pd-sweep{to{left:130%}}\n.pd-confetti{position:absolute;width:8px;height:8px;border-radius:50%;pointer-events:none;z-index:6;box-shadow:inset 0 0 0 2px rgba(0,0,0,.12)}\n.pd-confetti::after{content:\"\";position:absolute;inset:33%;border-radius:50%;background:rgba(0,0,0,.25)}\n.pd-empty{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;color:var(--pd-text-3);font-size:12.5px;text-align:center;z-index:2}\n.pd-empty span{background:color-mix(in srgb,var(--pd-board) 80%,transparent);padding:4px 10px;border-radius:999px}\n\n.pd-tools{min-height:var(--pd-toolbar-h);flex:none;display:flex;align-items:center;gap:2px;margin-top:var(--pd-gap);flex-wrap:wrap}\n.pd-tools .pd-sep{width:1px;height:16px;background:var(--pd-border);margin:0 4px}\n.pd-tool{width:var(--pd-hit);height:var(--pd-hit);border:0;border-radius:var(--pd-radius-ctl);background:transparent;color:var(--pd-text-2);display:grid;place-items:center;cursor:pointer;position:relative;padding:0;transition:background var(--pd-t-fast),color var(--pd-t-fast)}\n.pd-tool:hover{background:var(--pd-hover);color:var(--pd-text)}\n.pd-tool[aria-pressed=true]{background:var(--pd-accent-soft);color:var(--pd-accent)}\n.pd-tool:disabled{opacity:.35;cursor:default;background:transparent}\n.pd-tool svg{width:17px;height:17px}\n.pd-tool .pd-cur-swatch{position:absolute;right:5px;bottom:5px;width:7px;height:7px;border-radius:50%;background:var(--pd-c);box-shadow:0 0 0 1.5px var(--pd-bg)}\n.pd-palette{flex:none;display:grid;grid-template-columns:repeat(8,var(--pd-hit));gap:var(--pd-swatch-gap) 0;justify-content:space-between;margin-top:var(--pd-gap)}\n.pd-sw{width:var(--pd-hit);height:var(--pd-hit);border:0;padding:0;background:transparent;cursor:pointer;position:relative;display:grid;place-items:center;border-radius:50%}\n.pd-sw .pd-swb{width:var(--pd-swatch);height:var(--pd-swatch);border-radius:50%;display:block;position:relative;background:radial-gradient(circle at 50% 50%,color-mix(in srgb,var(--pd-c) 55%,#000) 0 17%,transparent 20%),radial-gradient(circle at 35% 30%,rgba(255,255,255,.55) 0 8%,transparent 30%),radial-gradient(circle at 42% 38%,color-mix(in srgb,var(--pd-c) 82%,#fff),var(--pd-c) 48%,color-mix(in srgb,var(--pd-c) 75%,#000));box-shadow:0 1px 2px rgba(0,0,0,.2),inset 0 0 0 .5px rgba(0,0,0,.15);transition:transform var(--pd-t-fast) var(--pd-ease-spring),opacity var(--pd-t)}\n.pd-sw:hover .pd-swb{transform:scale(1.08)}\n.pd-sw[aria-checked=true] .pd-swb{box-shadow:0 0 0 2px var(--pd-bg),0 0 0 4px var(--pd-text)}\n.pd-sw .pd-k{position:absolute;inset:0;display:grid;place-items:center;font:600 10.5px/1 var(--pd-font-code);color:var(--pd-l);opacity:0}\n.pd-root.pd-codes .pd-sw .pd-k{opacity:1}\n.pd-root.pd-codes .pd-sw .pd-swb{background:var(--pd-c)}\n.pd-sw .pd-cnt{position:absolute;top:-3px;right:-4px;min-width:15px;height:15px;padding:0 3px;border-radius:8px;background:var(--pd-surface-raised);color:var(--pd-text-2);font-size:9.5px;font-weight:600;line-height:15px;text-align:center;box-shadow:0 0 0 1px var(--pd-border);font-variant-numeric:tabular-nums;z-index:1}\n.pd-sw .pd-cnt.pd-ok{background:var(--pd-success);color:#fff;box-shadow:none}\n.pd-sw.pd-dim .pd-swb{opacity:.32}\n.pd-sw.pd-dim:hover .pd-swb,.pd-sw.pd-dim[aria-checked=true] .pd-swb{opacity:1}\n.pd-foot{min-height:var(--pd-footer-h);flex:none;display:flex;gap:8px;align-items:flex-end;margin-top:var(--pd-gap);flex-wrap:wrap}\n.pd-btn{min-height:var(--pd-hit);border-radius:var(--pd-radius-ctl);border:1px solid var(--pd-border);background:var(--pd-surface-raised);padding:0 12px;font-size:13px;font-weight:500;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px;color:var(--pd-text);white-space:nowrap;transition:background var(--pd-t-fast),transform var(--pd-t-fast),opacity var(--pd-t)}\n.pd-btn:hover{background:var(--pd-hover)}\n.pd-btn:active{transform:scale(.97)}\n.pd-btn:disabled{opacity:.4;cursor:default;transform:none}\n.pd-btn svg{width:15px;height:15px}\n.pd-btn.pd-primary{background:var(--pd-primary-fill);color:var(--pd-primary-label);border-color:transparent}\n.pd-btn.pd-primary:hover{opacity:.88;background:var(--pd-primary-fill)}\n.pd-btn.pd-warm{background:linear-gradient(180deg,#F7B23B,#EE8A1F);color:#fff;border-color:transparent;box-shadow:0 1px 0 rgba(255,255,255,.3) inset}\n.pd-btn.pd-warm:hover{filter:brightness(1.05);background:linear-gradient(180deg,#F7B23B,#EE8A1F)}\n.pd-btn.pd-ghost{border-color:transparent;background:transparent;color:var(--pd-text-2)}\n.pd-btn.pd-ghost:hover{background:var(--pd-hover);color:var(--pd-text)}\n.pd-btn.pd-grow{flex:1}\n/* cards under the board (coach / done / result): cover tools, never the artwork */\n.pd-under{position:relative}\n.pd-overlay{position:absolute;left:0;right:0;top:0;z-index:7;background:var(--pd-surface-raised);border:1px solid var(--pd-border);border-radius:var(--pd-radius-card);box-shadow:0 8px 24px rgba(0,0,0,.12);padding:12px;display:flex;flex-direction:column;gap:10px;animation:pd-card-in var(--pd-t) var(--pd-ease)}\n@keyframes pd-card-in{from{opacity:0;transform:translateY(8px)}}\n.pd-overlay .pd-t{font-weight:600;font-size:13.5px;display:flex;gap:8px;align-items:center;margin:0}\n.pd-overlay .pd-d{font-size:12.5px;color:var(--pd-text-2);line-height:1.55;margin:0}\n.pd-overlay .pd-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}\n/* AI view */\n.pd-ai-box{border:1px solid var(--pd-border);border-radius:var(--pd-radius-card);background:var(--pd-surface-raised);padding:10px;display:flex;flex-direction:column;gap:8px;transition:border-color var(--pd-t),box-shadow var(--pd-t)}\n.pd-ai-box:focus-within{border-color:var(--pd-accent);box-shadow:0 0 0 3px color-mix(in srgb,var(--pd-accent) 18%,transparent)}\n.pd-ai-box textarea{border:0;outline:0;resize:none;background:transparent;font:inherit;font-size:13.5px;color:var(--pd-text);height:60px;line-height:1.5;padding:0}\n.pd-ai-box textarea::placeholder{color:var(--pd-text-3)}\n.pd-ai-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}\n.pd-ai-row .pd-muted{font-size:11.5px;color:var(--pd-text-3);flex:1}\n.pd-chips{display:flex;flex-wrap:wrap;gap:6px;margin:12px 0 16px}\n.pd-chip{border:1px solid var(--pd-border);background:transparent;border-radius:999px;padding:0 12px;min-height:32px;font-size:12px;cursor:pointer;color:var(--pd-text-2);transition:background var(--pd-t-fast)}\n.pd-chip:hover{background:var(--pd-hover);color:var(--pd-text)}\n.pd-card{border-radius:var(--pd-radius-card);padding:12px;display:flex;flex-direction:column;gap:8px;font-size:12.5px;line-height:1.6;color:var(--pd-text-2);background:var(--pd-surface);margin-bottom:12px}\n.pd-card .pd-t{font-weight:600;color:var(--pd-text);font-size:13.5px;display:flex;gap:8px;align-items:center;margin:0}\n.pd-card.pd-err{background:color-mix(in srgb,var(--pd-danger) 9%,var(--pd-bg))}\n.pd-card.pd-err .pd-t{color:var(--pd-danger)}\n.pd-card .pd-acts{display:flex;gap:8px;flex-wrap:wrap}\n.pd-card ol{margin:0;padding-left:18px}\n.pd-card p{margin:0}\n/* menu & toast */\n.pd-menu{position:absolute;top:40px;right:8px;z-index:30;min-width:220px;background:var(--pd-surface-raised);border:1px solid var(--pd-border);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.14);padding:6px;animation:pd-pop .14s var(--pd-ease)}\n@keyframes pd-pop{from{opacity:0;transform:translateY(-4px)}}\n.pd-mi{display:flex;align-items:center;gap:10px;padding:0 8px;min-height:var(--pd-hit);border-radius:8px;font-size:13px;cursor:pointer;width:100%;border:0;background:transparent;text-align:left}\n.pd-mi:hover,.pd-mi:focus-visible{background:var(--pd-hover)}\n.pd-mi .pd-sw2{margin-left:auto;width:28px;height:16px;border-radius:8px;background:var(--pd-border);position:relative;transition:background var(--pd-t-fast);flex:none}\n.pd-mi .pd-sw2::after{content:\"\";position:absolute;top:2px;left:2px;width:12px;height:12px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.2);transition:transform var(--pd-t-fast) var(--pd-ease)}\n.pd-mi[aria-checked=true] .pd-sw2{background:var(--pd-accent)}\n.pd-mi[aria-checked=true] .pd-sw2::after{transform:translateX(12px)}\n.pd-menu hr{border:0;border-top:1px solid var(--pd-border-subtle);margin:4px 0}\n.pd-keys{margin:4px 8px 6px;padding:0;list-style:none;font-size:11.5px;color:var(--pd-text-2);display:flex;flex-direction:column;gap:3px}\n.pd-toast{position:absolute;left:50%;bottom:calc(16px + env(safe-area-inset-bottom));transform:translateX(-50%);background:var(--pd-toast-bg);color:var(--pd-toast-label);font-size:12.5px;border-radius:10px;padding:7px 8px 7px 12px;display:flex;gap:10px;align-items:center;z-index:40;max-width:calc(100% - 24px);box-shadow:0 6px 20px rgba(0,0,0,.18);animation:pd-toast-in var(--pd-t) var(--pd-ease)}\n@keyframes pd-toast-in{from{opacity:0;transform:translate(-50%,8px)}}\n.pd-toast button{border:0;background:rgb(255 255 255 / .14);color:inherit;border-radius:6px;padding:0 8px;min-height:28px;font-size:12px;cursor:pointer;font-weight:600}\nbody[data-ds-dark-theme] .pd-toast button{background:rgb(0 0 0 / .08)}\n\n/* container queries: the panel is 300px up to ~900px wide */\n@container pd (max-width: 340px){\n  .pd-root{--pd-pad:12px;--pd-swatch:26px}\n  .pd-tools .pd-sep{margin:0 1px}\n  .pd-tpls{gap:6px}\n}\n@container pd (min-width: 520px){\n  .pd-tpls{grid-template-columns:repeat(4,1fr)}\n  .pd-view{max-width:520px}\n}\n@container pd (min-width: 720px){\n  .pd-tpls{grid-template-columns:repeat(6,1fr)}\n  .pd-view.pd-wide{max-width:720px}\n}\n@media (prefers-reduced-motion: reduce){\n  .pd-root *,.pd-portal *,.pd-root *::before,.pd-root *::after{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important;transition-delay:0ms!important}\n  .pd-confetti{display:none}\n}\n@media (forced-colors: active){\n  .pd-bead{forced-color-adjust:none}\n  .pd-sw[aria-checked=true] .pd-swb{outline:2px solid CanvasText}\n}\n";
		let refs = 0;
		/** Add the shared stylesheet once; returns a release function (removed with the last user). */
		function ensureStyles(doc = document) {
			refs++;
			if (!doc.getElementById("dsh-pindou-styles")) {
				const el = doc.createElement("style");
				el.id = STYLE_ID;
				el.textContent = CSS;
				doc.head.append(el);
			}
			let released = false;
			return () => {
				if (released) return;
				released = true;
				refs--;
				if (refs <= 0) {
					refs = 0;
					doc.getElementById(STYLE_ID)?.remove();
				}
			};
		}
		// src/client/ui/Ai.tsx
		/**
		* AI page: one sentence → one LLM call → a pattern used as the faint guide.
		* Enter submits (never mid-IME composition), Esc cancels, 12|16 only.
		*/
		const ERR = {
			empty: "aiErrEmpty",
			parse: "aiErrParse",
			network: "aiErrNetwork",
			busy: "aiErrBusy",
			rate: "aiErrRate",
			timeout: "aiErrTimeout",
			"not-configured": "aiNotConfiguredBody"
		};
		function AiView() {
			const { store, t } = useEnv();
			const ai = useGame().ai;
			const id = (0, react.useId)();
			const area = (0, react.useRef)(null);
			const loading = ai.phase === "loading";
			const notConfigured = ai.status?.configured === false || ai.error === "not-configured";
			(0, react.useEffect)(() => {
				store.probeStatus();
				area.current?.focus({ preventScroll: true });
			}, [store]);
			const submit = () => {
				store.generate();
			};
			const examples = t("aiExamples").split("|");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-view",
				onKeyDown: (e) => {
					if (e.key === "Escape" && loading) {
						e.stopPropagation();
						store.cancelGenerate();
					}
				},
				children: [
					notConfigured ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-card",
						role: "status",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "pd-t",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconAlert, {}), t("aiNotConfigured")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("aiNotConfiguredBody") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ol", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("aiStep1") }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("aiStep2") })] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "pd-acts",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "pd-btn",
									onClick: () => {
										store.setAiPrompt(ai.prompt);
										store.probeStatus();
									},
									children: t("aiRecheck")
								}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "pd-btn pd-ghost",
									onClick: () => {
										store.go("home");
									},
									children: t("aiPlayTemplates")
								})]
							})
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-ai-box",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("label", {
								htmlFor: `${id}-q`,
								className: "pd-sr",
								children: t("aiLabel")
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("textarea", {
								id: `${id}-q`,
								ref: area,
								value: ai.prompt,
								maxLength: 60,
								placeholder: t("aiPlaceholder"),
								disabled: loading,
								"aria-describedby": `${id}-n`,
								onChange: (e) => {
									store.setAiPrompt(e.target.value.slice(0, 60));
								},
								onKeyDown: (e) => {
									if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing && e.keyCode !== 229) {
										e.preventDefault();
										submit();
									}
								}
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
								className: "pd-ai-row",
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "pd-seg",
										role: "group",
										"aria-label": t("size"),
										children: AI_SIZES.map((size) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
											type: "button",
											"aria-pressed": ai.size === size,
											disabled: loading,
											onClick: () => {
												store.setAiSize(size);
											},
											children: [
												size,
												"×",
												size
											]
										}, size))
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "pd-muted",
										id: `${id}-n`,
										children: t("aiChars", {
											n: ai.prompt.length,
											max: 60
										})
									}),
									loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
										type: "button",
										className: "pd-btn pd-ghost",
										onClick: () => {
											store.cancelGenerate();
										},
										children: t("aiCancel")
									}) : /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
										type: "button",
										className: "pd-btn pd-primary",
										disabled: ai.prompt.trim() === "",
										onClick: submit,
										children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconSparkle, {}), t("aiGenerate")]
									})
								]
							})
						]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						"aria-live": "polite",
						className: "pd-ai-row",
						style: {
							minHeight: 28,
							marginTop: 8
						},
						children: [
							loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-shimmer",
								role: "status",
								children: t("aiGenerating")
							}) : null,
							ai.status?.route === "mock" && !loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-tokens",
								children: t("aiMock")
							}) : null,
							ai.status?.model && ai.status.route !== "mock" && !loading ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-tokens",
								children: t("aiModel", { model: ai.status.model })
							}) : null
						]
					}),
					ai.phase === "error" && ai.error && ai.error !== "not-configured" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-card pd-err",
						role: "alert",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
								className: "pd-t",
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconAlert, {}), t("aiErrTitle")]
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t(ERR[ai.error]) }),
							ai.error !== "empty" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
								className: "pd-acts",
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "pd-btn",
									onClick: submit,
									children: t("aiRetry")
								})
							}) : null
						]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: cx("pd-chips"),
						role: "group",
						"aria-label": t("aiTipsTitle"),
						children: examples.map((ex) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "pd-chip",
							disabled: loading,
							onClick: () => {
								store.setAiPrompt(ex);
								area.current?.focus();
							},
							children: ex
						}, ex))
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-card",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
							className: "pd-t",
							children: t("aiTipsTitle")
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", { children: t("aiTips") })]
					})
				]
			});
		}
		// src/client/render.ts
		/**
		* Canvas drawing for the two places the design uses bitmaps: the start-page
		* thumbnails and PNG export (spec §13). The board itself is DOM.
		*/
		/** Ironed export: a cell's corner rounds only when both orthogonal neighbours along it are empty. */
		function cornerRadii(board, x, y) {
			const n = board.size;
			const filled = (cx, cy) => cx >= 0 && cy >= 0 && cx < n && cy < n && board.cells[cy * n + cx] !== -1;
			const up = filled(x, y - 1), down = filled(x, y + 1), left = filled(x - 1, y), right = filled(x + 1, y);
			return [
				!up && !left,
				!up && !right,
				!down && !right,
				!down && !left
			];
		}
		function bead(ctx, cx, cy, r, hex, hole) {
			const g = ctx.createRadialGradient(cx - r * .25, cy - r * .3, r * .1, cx, cy, r);
			g.addColorStop(0, shade(hex, .18));
			g.addColorStop(.5, hex);
			g.addColorStop(1, shade(hex, -.22));
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.fill();
			if (hole) {
				ctx.fillStyle = shade(hex, -.5);
				ctx.beginPath();
				ctx.arc(cx, cy, r * .36, 0, Math.PI * 2);
				ctx.fill();
			}
		}
		/** Mix a hex colour towards white (amount > 0) or black (amount < 0). */
		function shade(hex, amount) {
			const v = Number.parseInt(hex.slice(1), 16);
			const ch = [
				v >> 16 & 255,
				v >> 8 & 255,
				v & 255
			].map((c) => {
				return Math.round(c + ((amount > 0 ? 255 : 0) - c) * Math.abs(amount));
			});
			return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
		}
		/** Draw a small preview of a board into a canvas of `css` CSS pixels. */
		function drawThumb(canvas, board, css = 56, dpr = globalThis.devicePixelRatio || 1) {
			const px = Math.round(css * dpr);
			canvas.width = px;
			canvas.height = px;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;
			ctx.clearRect(0, 0, px, px);
			const cell = px / board.size;
			for (let i = 0; i < board.cells.length; i++) {
				const c = board.cells[i];
				if (c === -1) continue;
				const x = i % board.size, y = Math.floor(i / board.size);
				bead(ctx, (x + .5) * cell, (y + .5) * cell, cell * .47, PALETTE[c].hex, cell >= 5);
			}
		}
		/** Render the export bitmap: 32 px per cell plus a one-cell margin. */
		function renderExport(doc, board, ironed, dark) {
			const n = board.size;
			const side = (n + 2) * 32;
			const canvas = doc.createElement("canvas");
			canvas.width = side;
			canvas.height = side;
			const ctx = canvas.getContext("2d");
			if (!ctx) throw new Error("canvas unavailable");
			const o = 32;
			if (!ironed) {
				ctx.fillStyle = dark ? "#1C1D20" : "#EEF0F3";
				roundRect(ctx, o / 2, o / 2, side - o, side - o, 24);
				ctx.fill();
				ctx.fillStyle = dark ? "#34373D" : "#D3D8DF";
				for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
					if (board.cells[y * n + x] !== -1) continue;
					ctx.beginPath();
					ctx.arc(o + (x + .5) * o, o + (y + .5) * o, o * .11, 0, Math.PI * 2);
					ctx.fill();
				}
			}
			for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
				const c = board.cells[y * n + x];
				if (c === -1) continue;
				const hex = PALETTE[c].hex;
				if (ironed) {
					const [tl, tr, br, bl] = cornerRadii(board, x, y);
					const r = o * .42;
					ctx.fillStyle = hex;
					roundRect(ctx, o + x * o - .5, o + y * o - .5, 33, 33, [
						tl ? r : 0,
						tr ? r : 0,
						br ? r : 0,
						bl ? r : 0
					]);
					ctx.fill();
				} else bead(ctx, o + (x + .5) * o, o + (y + .5) * o, o * .44, hex, true);
			}
			return canvas;
		}
		function roundRect(ctx, x, y, w, h, r) {
			ctx.beginPath();
			if (typeof ctx.roundRect === "function") ctx.roundRect(x, y, w, h, r);
			else ctx.rect(x, y, w, h);
		}
		const p = (v) => String(v).padStart(2, "0");
		/** `bead-break-<id|ai|free>-YYYYMMDD-HHmm.png` */
		function exportFileName(target, at) {
			return `bead-break-${(target === null ? "free" : target.startsWith("ai:") ? "ai" : target.replaceAll(/[^a-z0-9-]/g, "")) || "free"}-${at.getFullYear()}${p(at.getMonth() + 1)}${p(at.getDate())}-${p(at.getHours())}${p(at.getMinutes())}.png`;
		}
		/** Download the board as PNG. Resolves false when the browser refuses. */
		async function downloadPng(doc, board, ironed, dark, target, now = /* @__PURE__ */ new Date()) {
			try {
				const canvas = renderExport(doc, board, ironed, dark);
				const blob = await new Promise((resolve) => {
					canvas.toBlob(resolve, "image/png");
				});
				if (!blob) return false;
				const url = URL.createObjectURL(blob);
				const a = doc.createElement("a");
				a.href = url;
				a.download = exportFileName(target, now);
				a.rel = "noopener";
				doc.body.append(a);
				a.click();
				a.remove();
				setTimeout(() => {
					URL.revokeObjectURL(url);
				}, 4e3);
				return true;
			} catch {
				return false;
			}
		}
		// src/client/ui/Home.tsx
		/** Start page: free play / AI cards, then the pattern grid with canvas thumbnails. */
		const Thumb = (0, react.memo)(function Thumb({ tpl }) {
			const ref = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				if (ref.current) drawThumb(ref.current, tpl.board);
			}, [tpl]);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("canvas", {
				ref,
				width: 56,
				height: 56,
				"aria-hidden": true
			});
		});
		function HomeView() {
			const { store, t, lang } = useEnv();
			const s = useGame();
			const inProgress = !s.ironed && s.history.present.cells.some((c) => c !== -1);
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-view",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-start",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "pd-big",
							onClick: () => {
								store.startFree();
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "pd-ic",
									"aria-hidden": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconGrid, {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("homeFree") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("homeFreeDesc") })
							]
						}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
							type: "button",
							className: "pd-big",
							onClick: () => {
								store.go("ai");
							},
							children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
									className: "pd-ic",
									"aria-hidden": true,
									children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconSparkle, {})
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("b", { children: t("homeAi") }),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("homeAiDesc") })
							]
						})]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h3", {
						className: "pd-sec",
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", { children: [
							t("homeTemplates"),
							" · ",
							t("homeCount", { n: TEMPLATES.length })
						] }), inProgress ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
							type: "button",
							className: "pd-link",
							onClick: () => {
								store.go("play");
							},
							children: t("homeContinue")
						}) : null]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("ul", {
						className: "pd-tpls",
						children: TEMPLATES.map((tpl) => {
							const name = lang === "zh" ? tpl.zh : tpl.en;
							const done = s.done.includes(tpl.id);
							return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "pd-tpl",
								"aria-label": t("tplAria", {
									name,
									size: tpl.board.size,
									n: tpl.colors,
									diff: tpl.difficulty
								}) + (done ? `，${t("tplDone")}` : ""),
								onClick: () => {
									store.follow(tpl.id);
								},
								children: [
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Thumb, { tpl }),
									/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "pd-nm",
										children: name
									}),
									/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("span", {
										className: "pd-meta",
										"aria-hidden": true,
										children: [t("tplMeta", { n: tpl.colors }), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
											className: "pd-diff",
											children: [
												1,
												2,
												3
											].map((d) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { className: d <= tpl.difficulty ? "pd-on" : void 0 }, d))
										})]
									}),
									done ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
										className: "pd-done",
										"aria-hidden": true,
										children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconCheck, {})
									}) : null
								]
							}) }, tpl.id);
						})
					})
				]
			});
		}
		// src/client/ui/Board.tsx
		/**
		* The bead board: a DOM grid (role=grid) so every cell is reachable by
		* keyboard and screen readers, with pointer capture for drag painting.
		* Right button erases, Alt picks (spec §6). Ironing is pure CSS driven by
		* per-bead delay (--pd-d) and per-corner radius variables.
		*/
		const MAX_BOARD = 480;
		const PAD = 6;
		const Cell = (0, react.memo)(function Cell({ id, value, ghost, hot, wrong, cur, label, delay, corners }) {
			const g = value === -1 && ghost !== -1;
			const style = g ? {
				"--pd-gc": PALETTE[ghost].hex,
				"--pd-gl": lightLabel(ghost)
			} : void 0;
			let bead = null;
			if (value !== -1) {
				const [tl, tr, br, bl] = corners;
				const bs = {
					"--pd-c": PALETTE[value].hex,
					"--pd-d": `${delay}ms`,
					"--pd-rtl": tl === "1" ? "42%" : "0",
					"--pd-rtr": tr === "1" ? "42%" : "0",
					"--pd-rbr": br === "1" ? "42%" : "0",
					"--pd-rbl": bl === "1" ? "42%" : "0"
				};
				bead = /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					className: "pd-bead",
					style: bs
				});
			}
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				id,
				role: "gridcell",
				"aria-label": label,
				"aria-selected": cur,
				className: cx("pd-cell", g && "pd-g", g && hot && "pd-hot", wrong && "pd-wrong", cur && "pd-cur"),
				"data-code": g ? codeOf(ghost) : void 0,
				style,
				children: bead
			});
		});
		/** Readable code colour on top of a ghost of colour `c`. */
		function lightLabel(c) {
			const v = Number.parseInt(PALETTE[c].hex.slice(1), 16);
			return .299 * (v >> 16 & 255) + .587 * (v >> 8 & 255) + .114 * (v & 255) > 150 ? "rgba(0,0,0,.65)" : "rgba(255,255,255,.9)";
		}
		function BoardView() {
			const { store, t, lang, reducedMotion } = useEnv();
			const s = useGame();
			const board = s.history.present;
			const target = s.targetBoard;
			const n = board.size;
			const uid = (0, react.useId)().replaceAll(":", "");
			const wrapRef = (0, react.useRef)(null);
			const boardRef = (0, react.useRef)(null);
			const [cell, setCell] = (0, react.useState)(17);
			const [cursorState, setCursor] = (0, react.useState)({
				x: Math.floor(n / 2),
				y: Math.floor(n / 2)
			});
			const [kbd, setKbd] = (0, react.useState)(false);
			(0, react.useLayoutEffect)(() => {
				const el = wrapRef.current;
				if (!el) return;
				const measure = () => {
					const a = Math.min(el.clientWidth || 300, MAX_BOARD);
					setCell(Math.max(8, Math.floor((a - 12) / n)));
				};
				measure();
				if (typeof ResizeObserver === "undefined") return;
				const ro = new ResizeObserver(measure);
				ro.observe(el);
				return () => {
					ro.disconnect();
				};
			}, [n]);
			const cur = {
				x: Math.min(cursorState.x, n - 1),
				y: Math.min(cursorState.y, n - 1)
			};
			const ironing = s.ironingSince !== null;
			const ironed = s.ironed || ironing;
			const celebrateAt = s.celebrateAt;
			const latest = (0, react.useRef)({
				board,
				target
			});
			(0, react.useEffect)(() => {
				latest.current = {
					board,
					target
				};
			});
			(0, react.useEffect)(() => {
				if (celebrateAt === null || reducedMotion()) return;
				const host = boardRef.current;
				if (!host || typeof host.animate !== "function") return;
				const nodes = [];
				const colors = [...new Set((latest.current.target ?? latest.current.board).cells.filter((c) => c !== -1))];
				const w = host.clientWidth;
				for (let i = 0; i < 18; i++) {
					const el = host.ownerDocument.createElement("i");
					el.className = "pd-confetti";
					el.setAttribute("aria-hidden", "true");
					el.style.left = `${w / 2 - 4}px`;
					el.style.top = `${w / 2 - 4}px`;
					el.style.background = PALETTE[colors[i % Math.max(1, colors.length)] ?? 2].hex;
					host.append(el);
					nodes.push(el);
					const ang = Math.PI * 2 * i / 18 + Math.random() * .4;
					const dist = w * (.28 + Math.random() * .25);
					el.animate([
						{
							transform: "translate(0,0) scale(.4)",
							opacity: 1
						},
						{
							transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist - 20}px) scale(1)`,
							opacity: 1,
							offset: .6
						},
						{
							transform: `translate(${Math.cos(ang) * dist}px,${Math.sin(ang) * dist + 30}px) scale(.8)`,
							opacity: 0
						}
					], {
						duration: 1400,
						easing: "cubic-bezier(.22,1,.36,1)",
						fill: "forwards"
					});
				}
				const timer = setTimeout(() => {
					for (const el of nodes) el.remove();
				}, 1500);
				return () => {
					clearTimeout(timer);
					for (const el of nodes) el.remove();
				};
			}, [celebrateAt, reducedMotion]);
			const cellAt = (0, react.useCallback)((e) => {
				const el = boardRef.current;
				if (!el) return null;
				const r = el.getBoundingClientRect();
				return {
					x: Math.floor((e.clientX - r.left - PAD) / cell),
					y: Math.floor((e.clientY - r.top - PAD) / cell)
				};
			}, [cell]);
			const onPointerDown = (e) => {
				if (e.button !== 0 && e.button !== 2) return;
				const p = cellAt(e);
				if (!p || p.x < 0 || p.y < 0 || p.x >= n || p.y >= n) return;
				e.preventDefault();
				boardRef.current?.focus({ preventScroll: true });
				setKbd(false);
				setCursor(p);
				const override = e.button === 2 ? "erase" : e.altKey ? "pick" : void 0;
				store.strokeStart(p.x, p.y, override);
				if (store.stroking) try {
					e.currentTarget.setPointerCapture(e.pointerId);
				} catch {}
			};
			const onPointerMove = (e) => {
				if (!store.stroking) return;
				const p = cellAt(e);
				if (p) store.strokeMove(p.x, p.y);
			};
			const onPointerUp = () => {
				store.strokeEnd();
			};
			const onKeyDown = (e) => {
				const m = {
					ArrowUp: [0, -1],
					ArrowDown: [0, 1],
					ArrowLeft: [-1, 0],
					ArrowRight: [1, 0]
				}[e.key];
				if (m) {
					e.preventDefault();
					setKbd(true);
					const next = {
						x: Math.max(0, Math.min(n - 1, cur.x + m[0])),
						y: Math.max(0, Math.min(n - 1, cur.y + m[1]))
					};
					setCursor(next);
					if (e.shiftKey) store.applyAt(next.x, next.y);
					return;
				}
				if (e.key === "Home" || e.key === "End") {
					e.preventDefault();
					setKbd(true);
					setCursor({
						x: e.key === "Home" ? 0 : n - 1,
						y: e.ctrlKey ? e.key === "Home" ? 0 : n - 1 : cur.y
					});
					return;
				}
				if (e.key === " " || e.key === "Enter") {
					e.preventDefault();
					setKbd(true);
					store.applyAt(cur.x, cur.y);
					return;
				}
				if (e.key === "Delete" || e.key === "Backspace") {
					e.preventDefault();
					setKbd(true);
					store.applyAt(cur.x, cur.y, "erase");
				}
			};
			const colorName = (c) => c === -1 ? t("emptyCell") : lang === "zh" ? PALETTE[c].zh : PALETTE[c].en;
			const rows = [];
			const showGuide = s.prefs.showGuide;
			for (let y = 0; y < n; y++) {
				const cells = [];
				for (let x = 0; x < n; x++) {
					const i = y * n + x;
					const v = board.cells[i];
					const want = target && showGuide ? target.cells[i] : -1;
					const wrong = target !== null && v !== -1 && target.cells[i] !== v;
					const corners = ironed && v !== -1 ? cornerRadii(board, x, y).map((b) => b ? "1" : "0").join("") : "0000";
					let label = t("cellLabel", {
						row: y + 1,
						col: x + 1,
						color: colorName(v)
					});
					if (target && target.cells[i] !== -1 && target.cells[i] !== v) label += t("cellGuide", { color: colorName(target.cells[i]) });
					cells.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Cell, {
						id: `${uid}-c${i}`,
						value: v,
						ghost: want,
						hot: want === s.color,
						wrong: wrong && !ironed,
						cur: kbd && cur.x === x && cur.y === y,
						label,
						delay: Math.round((x + y) * 780 / (2 * n - 2)),
						corners
					}, x));
				}
				rows.push(/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
					role: "row",
					className: "pd-row",
					children: cells
				}, y));
			}
			const empty = target === null && board.cells.every((c) => c === -1);
			const style = {
				"--pd-n": n,
				"--pd-cell": `${cell}px`
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-boardwrap",
				ref: wrapRef,
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
					ref: boardRef,
					role: "grid",
					tabIndex: 0,
					"aria-label": t("boardLabel", { size: n }),
					"aria-describedby": `${uid}-help`,
					"aria-activedescendant": `${uid}-c${cur.y * n + cur.x}`,
					"aria-readonly": ironed,
					"aria-rowcount": n,
					"aria-colcount": n,
					className: cx("pd-board", `pd-tool-${s.tool}`, kbd && "pd-kbd", ironed && "pd-ironed", !showGuide && "pd-noguide"),
					style,
					onPointerDown,
					onPointerMove,
					onPointerUp,
					onPointerCancel: onPointerUp,
					onLostPointerCapture: onPointerUp,
					onContextMenu: (e) => {
						e.preventDefault();
					},
					onKeyDown,
					onFocus: (e) => {
						if (e.target === e.currentTarget && e.currentTarget.matches(":focus-visible")) setKbd(true);
					},
					onBlur: () => {
						setKbd(false);
					},
					children: [
						rows,
						ironing ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "pd-sweep",
							"aria-hidden": true
						}) : null,
						empty ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
							className: "pd-empty",
							"aria-hidden": true,
							children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t("playEmpty") })
						}) : null
					]
				}), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
					id: `${uid}-help`,
					className: "pd-sr",
					children: t("boardHelp")
				})]
			});
		}
		// src/client/ui/Play.tsx
		/** The play view: status line, board, toolbar, palette, footer and the under-board cards. */
		const TOOLS = [
			{
				tool: "paint",
				key: "B",
				icon: IconBrush,
				label: "toolPaint"
			},
			{
				tool: "erase",
				key: "E",
				icon: IconEraser,
				label: "toolErase"
			},
			{
				tool: "pick",
				key: "I",
				icon: IconPicker,
				label: "toolPick"
			},
			{
				tool: "fill",
				key: "G",
				icon: IconFill,
				label: "toolFill"
			}
		];
		function exportBoard(env) {
			const s = env.store.getSnapshot();
			downloadPng(document, s.history.present, s.ironed, env.dark(), s.target).then((ok) => {
				env.store.showToast(ok ? "exported" : "exportFailed");
			});
		}
		function StatusLine() {
			const { store, t, lang } = useEnv();
			const s = useGame();
			const board = s.history.present;
			const target = s.targetBoard;
			const tpl = s.target ? findTemplate(s.target) : void 0;
			const isAi = s.target?.startsWith("ai:") ?? false;
			const ai = isAi ? s.ai.result : void 0;
			const name = tpl ? lang === "zh" ? tpl.zh : tpl.en : isAi ? ai?.prompt ?? t("homeAi") : t("playFree");
			const beads = board.cells.filter((c) => c !== -1).length;
			const c = target ? completion(board, target) : null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-status",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-line",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("strong", {
								title: name,
								children: name
							}),
							ai?.usage ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-tokens",
								children: t("aiTokens", { n: ai.usage.input + ai.usage.output })
							}) : null,
							ai?.cached ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-tokens",
								children: t("aiTokensCached")
							}) : null,
							c && c.wrong > 0 ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-warn",
								children: t("playWrong", { n: c.wrong })
							}) : null,
							c ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-r",
								children: t("playProgress", {
									ok: c.matched,
									total: c.total,
									pct: c.percent
								})
							}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-r pd-seg",
								role: "group",
								"aria-label": t("size"),
								children: BOARD_SIZES.map((size) => /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									"aria-pressed": board.size === size,
									disabled: s.ironed,
									onClick: () => {
										store.resize(size);
									},
									children: size
								}, size))
							}),
							!c ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-tokens",
								children: t("playBeads", { n: beads })
							}) : null
						]
					}),
					c ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: cx("pd-prog", c.done && "pd-full"),
						role: "progressbar",
						"aria-label": t("progressLabel"),
						"aria-valuemin": 0,
						"aria-valuemax": 100,
						"aria-valuenow": c.percent,
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("i", { style: { width: `${c.percent}%` } })
					}) : null,
					ai && (ai.repaired || ai.truncated) ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "pd-line",
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "pd-tokens",
							children: t(ai.truncated ? "aiTruncated" : "aiRepaired")
						})
					}) : null
				]
			});
		}
		function Toolbar() {
			const { store, t } = useEnv();
			const s = useGame();
			const locked = s.ironed || s.ironingSince !== null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-tools",
				role: "toolbar",
				"aria-label": t("toolsLabel"),
				children: [
					TOOLS.map(({ tool, key, icon: Icon, label }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "pd-tool",
						"aria-pressed": s.tool === tool,
						disabled: locked,
						"aria-label": t(label),
						"aria-keyshortcuts": key,
						title: `${t(label)} (${key})`,
						onClick: () => {
							store.setTool(tool);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Icon, {}), tool === "paint" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "pd-cur-swatch",
							style: { "--pd-c": PALETTE[s.color].hex }
						}) : null]
					}, tool)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "pd-sep",
						"aria-hidden": true
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "pd-tool",
						"aria-label": t("undo"),
						title: `${t("undo")} (⌘Z)`,
						"aria-keyshortcuts": "Control+Z Meta+Z",
						disabled: !store.canUndo && !s.ironed,
						onClick: () => {
							store.undo();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconUndo, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "pd-tool",
						"aria-label": t("redo"),
						title: `${t("redo")} (⇧⌘Z)`,
						"aria-keyshortcuts": "Control+Shift+Z Meta+Shift+Z",
						disabled: !store.canRedo,
						onClick: () => {
							store.redo();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconRedo, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
						className: "pd-sep",
						"aria-hidden": true
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "pd-tool",
						"aria-label": t("clear"),
						title: t("clear"),
						disabled: locked || s.history.present.cells.every((c) => c === -1),
						onClick: () => {
							store.clear();
						},
						children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconTrash, {})
					})
				]
			});
		}
		function Palette() {
			const { store, t, lang } = useEnv();
			const s = useGame();
			const target = s.targetBoard;
			const remaining = target ? remainingByColor(s.history.present, target) : null;
			const used = target ? new Set(target.cells.filter((c) => c !== -1)) : null;
			const refs = (0, react.useRef)([]);
			const move = (to) => {
				const i = (to + COLOR_COUNT) % COLOR_COUNT;
				store.setColor(i);
				refs.current[i]?.focus();
			};
			return /* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
				className: "pd-palette",
				role: "radiogroup",
				"aria-label": t("paletteLabel"),
				children: PALETTE.map((p, i) => {
					const left = remaining?.get(i) ?? 0;
					const inTarget = used?.has(i) ?? false;
					const name = lang === "zh" ? p.zh : p.en;
					return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						ref: (el) => {
							refs.current[i] = el;
						},
						type: "button",
						role: "radio",
						"aria-checked": s.color === i,
						tabIndex: s.color === i ? 0 : -1,
						"aria-label": t("colorTip", {
							name,
							code: p.code
						}),
						title: t("colorTip", {
							name,
							code: p.code
						}),
						className: cx("pd-sw", used !== null && !inTarget && "pd-dim"),
						style: {
							"--pd-c": p.hex,
							"--pd-l": lightLabelOf(i)
						},
						onClick: () => {
							store.setColor(i);
						},
						onKeyDown: (e) => {
							const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
							if (d !== 0) {
								e.preventDefault();
								move(i + (e.key === "ArrowDown" || e.key === "ArrowUp" ? d * 8 : d));
							}
						},
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-swb",
								"aria-hidden": true
							}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: "pd-k",
								"aria-hidden": true,
								children: codeOf(i)
							}),
							inTarget ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
								className: cx("pd-cnt", left === 0 && "pd-ok"),
								"aria-hidden": true,
								children: left === 0 ? "✓" : left
							}) : null
						]
					}, p.code);
				})
			});
		}
		function lightLabelOf(i) {
			const v = Number.parseInt(PALETTE[i].hex.slice(1), 16);
			return .299 * (v >> 16 & 255) + .587 * (v >> 8 & 255) + .114 * (v & 255) > 150 ? "rgba(0,0,0,.7)" : "#fff";
		}
		function Footer() {
			const env = useEnv();
			const { store, t } = env;
			const s = useGame();
			const empty = s.history.present.cells.every((c) => c === -1);
			const ironing = s.ironingSince !== null;
			const isAi = s.target?.startsWith("ai:") ?? false;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-foot",
				children: [
					isAi && !s.ironed ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "pd-btn pd-ghost",
						disabled: ironing || s.celebrateAt !== null,
						onClick: () => {
							store.fillTarget();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconSparkle, {}), t("fillBoard")]
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "pd-btn pd-warm pd-grow",
						disabled: empty || s.ironed || ironing,
						"aria-busy": ironing,
						onClick: () => {
							store.iron();
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconIron, {}), ironing ? t("ironing") : t("iron")]
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "pd-btn",
						disabled: empty,
						onClick: () => {
							exportBoard(env);
						},
						children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconDownload, {}), t("exportPng")]
					})
				]
			});
		}
		function OverlayCard() {
			const env = useEnv();
			const { store, t } = env;
			const s = useGame();
			const ref = (0, react.useRef)(null);
			const kind = s.overlay;
			(0, react.useEffect)(() => {
				ref.current?.querySelector("[data-primary]")?.focus({ preventScroll: true });
			}, [kind]);
			if (kind === null) return null;
			const board = s.history.present;
			const beads = board.cells.filter((c) => c !== -1).length;
			const colors = new Set(board.cells.filter((c) => c !== -1)).size;
			const title = kind === "coach" ? t("coachTitle") : kind === "done" ? t("doneTitle") : t("resultTitle");
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref,
				className: "pd-overlay",
				role: "dialog",
				"aria-modal": "false",
				"aria-labelledby": "pd-ov-t",
				onKeyDown: (e) => {
					if (e.key === "Escape") {
						e.stopPropagation();
						store.dismissOverlay();
					}
				},
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("p", {
						className: "pd-t",
						id: "pd-ov-t",
						children: [kind === "result" ? "✨ " : kind === "done" ? "🎉 " : "", title]
					}),
					kind === "coach" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pd-d",
						children: t("coachBody")
					}) : null,
					kind === "done" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pd-d",
						children: t("doneBody")
					}) : null,
					kind === "result" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pd-d",
						children: t("resultCount", {
							n: beads,
							c: colors
						})
					}) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-acts",
						children: [
							kind === "coach" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "pd-btn pd-primary",
								"data-primary": true,
								onClick: () => {
									store.dismissOverlay();
								},
								children: t("coachOk")
							}) : null,
							kind === "done" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "pd-btn pd-ghost",
								onClick: () => {
									store.dismissOverlay();
								},
								children: t("doneLater")
							}), /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
								type: "button",
								className: "pd-btn pd-warm",
								"data-primary": true,
								onClick: () => {
									store.iron();
								},
								children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconIron, {}), t("iron")]
							})] }) : null,
							kind === "result" ? /* @__PURE__ */ (0, react_jsx_runtime.jsxs)(react_jsx_runtime.Fragment, { children: [
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "pd-btn pd-ghost",
									onClick: () => {
										store.unIron();
									},
									children: t("unIron")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
									type: "button",
									className: "pd-btn",
									onClick: () => {
										store.again();
									},
									children: t("again")
								}),
								/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
									type: "button",
									className: "pd-btn pd-primary",
									"data-primary": true,
									onClick: () => {
										exportBoard(env);
									},
									children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconDownload, {}), t("exportPng")]
								})
							] }) : null
						]
					})
				]
			});
		}
		function PlayView() {
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-view",
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(StatusLine, {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(BoardView, {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
						className: "pd-under",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toolbar, {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Palette, {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Footer, {}),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)(OverlayCard, {})
						]
					})
				]
			});
		}
		// src/client/ui/App.tsx
		/** Panel shell: inner header (back · logo + name · ⋯ menu), the current view, toast and live region. */
		const TOAST_TEXT = {
			cleared: "toastCleared",
			locked: "toastLocked",
			exported: "toastExported",
			exportFailed: "toastExportFailed",
			storageUnavailable: "storageUnavailable",
			storageRecovered: "storageRecovered"
		};
		const TOAST_MS = 2400;
		const TOAST_UNDO_MS = 5e3;
		function isTyping(el) {
			if (!(el instanceof HTMLElement)) return false;
			return el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "INPUT" && el.type !== "checkbox";
		}
		function Menu({ onClose }) {
			const { store, t } = useEnv();
			const s = useGame();
			const ref = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				ref.current?.querySelector("[role=menuitemcheckbox],[role=menuitem]")?.focus();
				const close = (e) => {
					if (ref.current && !ref.current.contains(e.target) && !e.target.closest?.("[data-pd-menu-btn]")) onClose();
				};
				document.addEventListener("pointerdown", close, true);
				return () => {
					document.removeEventListener("pointerdown", close, true);
				};
			}, [onClose]);
			const toggles = [
				{
					key: "busyHint",
					label: "menuBusyHint"
				},
				{
					key: "showGuide",
					label: "menuGuide"
				},
				{
					key: "showCodes",
					label: "menuCodes"
				}
			];
			const items = () => [...ref.current?.querySelectorAll("[role^=menuitem]") ?? []];
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				ref,
				className: "pd-menu",
				role: "menu",
				tabIndex: -1,
				"aria-label": t("settings"),
				onKeyDown: (e) => {
					if (e.key === "Escape") {
						e.stopPropagation();
						onClose();
						return;
					}
					if (e.key === "ArrowDown" || e.key === "ArrowUp") {
						e.preventDefault();
						const list = items();
						list[(list.indexOf(document.activeElement) + (e.key === "ArrowDown" ? 1 : -1) + list.length) % list.length]?.focus();
					}
				},
				children: [
					toggles.map(({ key, label }) => /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("button", {
						type: "button",
						className: "pd-mi",
						role: "menuitemcheckbox",
						"aria-checked": s.prefs[key],
						onClick: () => {
							store.setPrefs({ [key]: !s.prefs[key] });
						},
						children: [t(label), /* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", {
							className: "pd-sw2",
							"aria-hidden": true
						})]
					}, key)),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
						type: "button",
						className: "pd-mi",
						role: "menuitem",
						onClick: () => {
							store.showCoach();
							onClose();
						},
						children: t("menuCoach")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("hr", {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("p", {
						className: "pd-sec",
						style: { margin: "4px 8px 2px" },
						children: t("keysTitle")
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("ul", {
						className: "pd-keys",
						children: [
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("keysTools") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("keysColors") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("keysHistory") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("keysBoard") }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("li", { children: t("keysEsc") })
						]
					})
				]
			});
		}
		function Toast() {
			const { store, t } = useEnv();
			const toast = useGame().toast;
			(0, react.useEffect)(() => {
				if (!toast) return;
				const id = setTimeout(() => {
					store.hideToast();
				}, toast.undo ? TOAST_UNDO_MS : TOAST_MS);
				return () => {
					clearTimeout(id);
				};
			}, [toast, store]);
			if (!toast) return null;
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: "pd-toast",
				role: "status",
				children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)("span", { children: t(TOAST_TEXT[toast.key]) }), toast.undo ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
					type: "button",
					onClick: () => {
						store.undo();
						store.hideToast();
					},
					children: t("toastUndo")
				}) : null]
			});
		}
		function App() {
			const { store, t } = useEnv();
			const s = useGame();
			const [menu, setMenu] = (0, react.useState)(false);
			const scroller = (0, react.useRef)(null);
			(0, react.useEffect)(() => {
				scroller.current?.scrollTo?.({ top: 0 });
			}, [s.mode]);
			const onKeyDown = (e) => {
				if (e.key === "Escape") {
					if (menu) {
						setMenu(false);
						return;
					}
					if (s.overlay) {
						store.dismissOverlay();
						return;
					}
					if (s.ai.phase === "loading") {
						store.cancelGenerate();
						return;
					}
					return;
				}
				if (s.mode !== "play" || isTyping(e.target) || e.target.closest?.("[role=menu]")) return;
				const mod = e.metaKey || e.ctrlKey;
				if (mod && !e.altKey && (e.key === "z" || e.key === "Z")) {
					e.preventDefault();
					if (e.shiftKey) store.redo();
					else store.undo();
					return;
				}
				if (mod && (e.key === "y" || e.key === "Y")) {
					e.preventDefault();
					store.redo();
					return;
				}
				if (mod || e.altKey) return;
				const tool = {
					b: "paint",
					e: "erase",
					i: "pick",
					g: "fill"
				}[e.key.toLowerCase()];
				if (tool) {
					e.preventDefault();
					store.setTool(tool);
					return;
				}
				const digit = /^Digit(\d)$/.exec(e.code);
				if (digit) {
					const d = Number(digit[1]);
					const idx = e.shiftKey ? d >= 1 && d <= 6 ? 9 + d : -1 : d === 0 ? 9 : d - 1;
					if (idx >= 0) {
						e.preventDefault();
						store.setColor(idx);
					}
					return;
				}
				if (e.key === "[" || e.key === "]") {
					e.preventDefault();
					store.setColor((s.color + (e.key === "]" ? 1 : -1) + COLOR_COUNT) % COLOR_COUNT);
				}
			};
			const live = s.celebrateAt !== null ? t("celebrate") : "";
			return /* @__PURE__ */ (0, react_jsx_runtime.jsxs)("div", {
				className: cx("pd-root", s.prefs.showCodes && "pd-codes"),
				onKeyDown,
				"data-mode": s.mode,
				children: [
					/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("header", {
						className: "pd-head",
						children: [
							s.mode !== "home" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "pd-ib",
								"aria-label": t("back"),
								title: t("back"),
								onClick: () => {
									store.go("home");
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconBack, {})
							}) : null,
							/* @__PURE__ */ (0, react_jsx_runtime.jsxs)("h2", { children: [/* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconLogo, { className: "pd-logo" }), t("appName")] }),
							/* @__PURE__ */ (0, react_jsx_runtime.jsx)("button", {
								type: "button",
								className: "pd-ib",
								"data-pd-menu-btn": true,
								"aria-label": t("settings"),
								title: t("settings"),
								"aria-haspopup": "menu",
								"aria-expanded": menu,
								onClick: () => {
									setMenu((m) => !m);
								},
								children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(IconMore, {})
							})
						]
					}),
					menu ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(Menu, { onClose: () => {
						setMenu(false);
					} }) : null,
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "pd-scroll",
						ref: scroller,
						children: s.mode === "home" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(HomeView, {}) : s.mode === "ai" ? /* @__PURE__ */ (0, react_jsx_runtime.jsx)(AiView, {}) : /* @__PURE__ */ (0, react_jsx_runtime.jsx)(PlayView, {})
					}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)(Toast, {}),
					/* @__PURE__ */ (0, react_jsx_runtime.jsx)("div", {
						className: "pd-sr",
						"aria-live": "polite",
						role: "status",
						children: live
					})
				]
			});
		}
		// src/client/index.tsx
		/**
		* Browser half of dsh-pindou (Bead Break · 拼豆小憩).
		*
		* - a `pindou` right-sidebar tab (kind `pindou`, kept mounted, on the guide page)
		* - an entry button in `conversation.session.header.actions`
		* - one shared GameStore per plugin lifetime (localStorage-backed, disposed with the plugin)
		*
		* Host types are not bundled; the minimal shapes used here are declared below
		* so the bundle depends on nothing but React at runtime.
		*/
		const name = "dsh-pindou";
		const NS = "pindou";
		const KIND = "pindou";
		const TAB_ID = "dsh-pindou";
		const inject = [
			"slots",
			"locale",
			"sidebarRightTabs",
			"sidebarRight"
		];
		/** Whether a Bead Break panel is currently on screen (suppresses the busy bubble). */
		function panelVisible() {
			return [...document.querySelectorAll(".pd-root")].some((el) => el.getClientRects().length > 0);
		}
		function langOf(active) {
			return active?.toLowerCase().startsWith("zh") ? "zh" : "en";
		}
		function apply(ctx) {
			ctx.effect(() => ensureStyles(), "pindou: styles");
			ctx.effect(() => ctx.locale.register(NS, {
				zh,
				en
			}), "pindou: dictionaries");
			const store = new GameStore({
				store: new SafeStore(browserStorage()),
				api: fetchApi(),
				reducedMotion: prefersReducedMotion
			});
			ctx.effect(() => () => {
				store.dispose();
			}, "pindou: game store");
			const flush = () => {
				store.flush();
			};
			ctx.effect(() => {
				globalThis.addEventListener?.("pagehide", flush);
				return () => {
					globalThis.removeEventListener?.("pagehide", flush);
				};
			}, "pindou: save on pagehide");
			const lang = () => langOf(ctx.locale.getSnapshot().active);
			const tFor = (l) => l === "zh" ? tZh : tEn;
			const tZh = makeTranslate("zh");
			const tEn = makeTranslate("en");
			const useLang = () => (0, react.useSyncExternalStore)((fn) => ctx.locale.subscribe(fn), lang, lang);
			const useT = () => tFor(useLang());
			const open = () => {
				try {
					ctx.sidebarRight.openTab(KIND);
				} catch {}
			};
			function Body() {
				const l = useLang();
				return /* @__PURE__ */ (0, react_jsx_runtime.jsx)(EnvContext.Provider, {
					value: {
						store,
						lang: l,
						t: tFor(l),
						reducedMotion: prefersReducedMotion,
						dark: () => isDark()
					},
					children: /* @__PURE__ */ (0, react_jsx_runtime.jsx)(App, {})
				});
			}
			ctx.effect(() => ctx.sidebarRightTabs.register({
				id: TAB_ID,
				kind: KIND,
				priority: "extension",
				keepMounted: true,
				title: () => tFor(lang())("appName"),
				guide: [{
					id: "pindou",
					order: 90,
					title: () => tFor(lang())("appName"),
					description: () => tFor(lang())("guideDesc"),
					icon: IconBead
				}]
			}), "pindou: tab type");
			ctx.effect(() => ctx.slots.inject("sidebar.right.pane.tab", () => ctx.slots.register({
				name: "sidebar.right.pane.tab",
				key: TAB_ID,
				locale: NS
			}, Body)), "pindou: tab body");
			const Entry = makeEntry({
				store,
				open,
				useT,
				panelVisible
			});
			ctx.effect(() => ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
				name: "conversation.session.header.actions",
				id: "dsh-pindou-entry",
				order: 30,
				locale: NS
			}, Entry)), "pindou: header entry");
		}
		exports.KIND = KIND;
		exports.NS = NS;
		exports.TAB_ID = TAB_ID;
		exports.apply = apply;
		exports.inject = inject;
		exports.langOf = langOf;
		exports.name = name;
		return module.exports;
	}
});
