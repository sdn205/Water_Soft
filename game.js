(function () {
  "use strict";

  const COLORS = [
    "#FF4444", "#FF8C00", "#FFD700", "#4CAF50",
    "#00BCD4", "#2196F3", "#9C27B0", "#FF69B4"
  ];
  const COLOR_NAMES = ["红", "橙", "黄", "绿", "青", "蓝", "紫", "粉"];
  const TUBE_CAPACITY = 4;
  const NUM_COLORS = 8;
  const NUM_EMPTY = 2;
  const NUM_TUBES = NUM_COLORS + NUM_EMPTY;

  const TUBE_MASK = 0xFFFF;
  const BITS_PER_LAYER = 4;
  const EMPTY_SLOT = 0xF;

  function mulberry32(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6D2B79F5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function hashSeed(levelNum) {
    let h = levelNum | 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
    h = (h ^ (h >>> 16)) >>> 0;
    return h;
  }

  function encodeTube(colors) {
    let val = 0;
    for (let i = 0; i < colors.length && i < TUBE_CAPACITY; i++) {
      val |= (colors[i] & 0xF) << (i * BITS_PER_LAYER);
    }
    for (let i = colors.length; i < TUBE_CAPACITY; i++) {
      val |= EMPTY_SLOT << (i * BITS_PER_LAYER);
    }
    return val;
  }

  function decodeTube(val) {
    const colors = [];
    for (let i = 0; i < TUBE_CAPACITY; i++) {
      const c = (val >> (i * BITS_PER_LAYER)) & 0xF;
      if (c !== EMPTY_SLOT) colors.push(c);
    }
    return colors;
  }

  function tubeLen(val) {
    let len = 0;
    for (let i = 0; i < TUBE_CAPACITY; i++) {
      if (((val >> (i * BITS_PER_LAYER)) & 0xF) !== EMPTY_SLOT) len++;
    }
    return len;
  }

  function tubeTop(val) {
    for (let i = TUBE_CAPACITY - 1; i >= 0; i--) {
      const c = (val >> (i * BITS_PER_LAYER)) & 0xF;
      if (c !== EMPTY_SLOT) return c;
    }
    return -1;
  }

  function tubeTopCount(val) {
    const top = tubeTop(val);
    if (top < 0) return 0;
    let count = 0;
    for (let i = TUBE_CAPACITY - 1; i >= 0; i--) {
      const c = (val >> (i * BITS_PER_LAYER)) & 0xF;
      if (c === top) count++;
      else if (c !== EMPTY_SLOT) break;
    }
    return count;
  }

  function tubeSpace(val) {
    return TUBE_CAPACITY - tubeLen(val);
  }

  function tubeIsEmpty(val) {
    return tubeLen(val) === 0;
  }

  function tubeIsComplete(val) {
    const len = tubeLen(val);
    if (len === 0) return true;
    if (len !== TUBE_CAPACITY) return false;
    const first = val & 0xF;
    for (let i = 1; i < TUBE_CAPACITY; i++) {
      if (((val >> (i * BITS_PER_LAYER)) & 0xF) !== first) return false;
    }
    return true;
  }

  function canPour(srcVal, dstVal) {
    if (tubeIsEmpty(srcVal)) return 0;
    const space = tubeSpace(dstVal);
    if (space <= 0) return 0;
    if (tubeIsEmpty(dstVal)) return Math.min(tubeTopCount(srcVal), space);
    if (tubeTop(dstVal) !== tubeTop(srcVal)) return 0;
    return Math.min(tubeTopCount(srcVal), space);
  }

  function doPour(srcVal, dstVal, count) {
    let s = srcVal, d = dstVal;
    const color = tubeTop(s);
    for (let i = 0; i < count; i++) {
      const si = TUBE_CAPACITY - 1;
      for (let j = TUBE_CAPACITY - 1; j >= 0; j--) {
        if (((s >> (j * BITS_PER_LAYER)) & 0xF) !== EMPTY_SLOT) {
          s &= ~(0xF << (j * BITS_PER_LAYER));
          s |= EMPTY_SLOT << (j * BITS_PER_LAYER);
          break;
        }
      }
      for (let j = 0; j < TUBE_CAPACITY; j++) {
        if (((d >> (j * BITS_PER_LAYER)) & 0xF) === EMPTY_SLOT) {
          d &= ~(0xF << (j * BITS_PER_LAYER));
          d |= color << (j * BITS_PER_LAYER);
          break;
        }
      }
    }
    return { src: s, dst: d };
  }

  function encodeState(tubes) {
    const arr = new Uint32Array(5);
    for (let i = 0; i < NUM_TUBES; i++) {
      const val = encodeTube(tubes[i].colors);
      const wordIdx = (i * 16) >>> 5;
      const bitOff = (i * 16) & 31;
      arr[wordIdx] |= (val & TUBE_MASK) << bitOff;
      if (bitOff > 16) {
        arr[wordIdx + 1] |= (val & TUBE_MASK) >>> (32 - bitOff);
      }
    }
    return arr;
  }

  function decodeState(arr) {
    const tubes = [];
    for (let i = 0; i < NUM_TUBES; i++) {
      const wordIdx = (i * 16) >>> 5;
      const bitOff = (i * 16) & 31;
      let val = (arr[wordIdx] >>> bitOff) & TUBE_MASK;
      if (bitOff > 16) {
        val |= (arr[wordIdx + 1] << (32 - bitOff)) & TUBE_MASK;
      }
      tubes.push(new Tube(decodeTube(val)));
    }
    return tubes;
  }

  function stateKey(arr) {
    return arr[0] + "_" + arr[1] + "_" + arr[2] + "_" + arr[3] + "_" + arr[4];
  }

  function arrClone(arr) {
    return new Uint32Array(arr);
  }

  const COMPLETION_STATE = (function () {
    const e = new Uint32Array(5);
    for (let i = 0; i < NUM_COLORS; i++) {
      let val = 0;
      for (let j = 0; j < TUBE_CAPACITY; j++) {
        val |= i << (j * BITS_PER_LAYER);
      }
      const wordIdx = (i * 16) >>> 5;
      const bitOff = (i * 16) & 31;
      e[wordIdx] |= (val & TUBE_MASK) << bitOff;
      if (bitOff > 16) {
        e[wordIdx + 1] |= (val & TUBE_MASK) >>> (32 - bitOff);
      }
    }
    for (let i = NUM_COLORS; i < NUM_TUBES; i++) {
      let val = EMPTY_SLOT << 0 | EMPTY_SLOT << 4 | EMPTY_SLOT << 8 | EMPTY_SLOT << 12;
      const wordIdx = (i * 16) >>> 5;
      const bitOff = (i * 16) & 31;
      e[wordIdx] |= (val & TUBE_MASK) << bitOff;
      if (bitOff > 16) {
        e[wordIdx + 1] |= (val & TUBE_MASK) >>> (32 - bitOff);
      }
    }
    return e;
  })();
  const COMPLETION_KEY = stateKey(COMPLETION_STATE);

  function getTubeVal(arr, idx) {
    const wordIdx = (idx * 16) >>> 5;
    const bitOff = (idx * 16) & 31;
    let val = (arr[wordIdx] >>> bitOff) & TUBE_MASK;
    if (bitOff > 16) {
      val |= (arr[wordIdx + 1] << (32 - bitOff)) & TUBE_MASK;
    }
    return val;
  }

  function setTubeVal(arr, idx, val) {
    const wordIdx = (idx * 16) >>> 5;
    const bitOff = (idx * 16) & 31;
    arr[wordIdx] &= ~(TUBE_MASK << bitOff);
    arr[wordIdx] |= (val & TUBE_MASK) << bitOff;
    if (bitOff > 16) {
      arr[wordIdx + 1] &= ~(TUBE_MASK >>> (32 - bitOff));
      arr[wordIdx + 1] |= (val & TUBE_MASK) >>> (32 - bitOff);
    }
  }

  function bfsSolveFast(tubes, maxSteps, findPaths) {
    const startArr = encodeState(tubes);
    const startKey = stateKey(startArr);
    if (startKey === COMPLETION_KEY) {
      return { solvable: true, steps: 0, moves: [], pathCount: 1 };
    }

    const visited = new Map();
    visited.set(startKey, { depth: 0, parent: null, srcIdx: -1, dstIdx: -1 });

    const queue = [startArr];
    let qHead = 0;
    let minSteps = maxSteps || 60;
    let found = false;
    const solutions = [];
    const MAX_QUEUE = 500000;

    while (qHead < queue.length) {
      if (queue.length > MAX_QUEUE) {
        return { solvable: false, steps: -1, moves: [], pathCount: 0, overflow: true };
      }

      const cur = queue[qHead++];
      const curKey = stateKey(cur);
      const curInfo = visited.get(curKey);
      const depth = curInfo.depth;

      if (depth >= minSteps) continue;

      for (let srcIdx = 0; srcIdx < NUM_TUBES; srcIdx++) {
        const srcVal = getTubeVal(cur, srcIdx);
        if (tubeIsEmpty(srcVal)) continue;

        for (let dstIdx = 0; dstIdx < NUM_TUBES; dstIdx++) {
          if (srcIdx === dstIdx) continue;
          const dstVal = getTubeVal(cur, dstIdx);
          const n = canPour(srcVal, dstVal);
          if (n <= 0) continue;

          const next = arrClone(cur);
          const result = doPour(srcVal, dstVal, n);
          setTubeVal(next, srcIdx, result.src);
          setTubeVal(next, dstIdx, result.dst);

          const nextKey = stateKey(next);

          if (!visited.has(nextKey)) {
            visited.set(nextKey, {
              depth: depth + 1,
              parent: curKey,
              srcIdx,
              dstIdx
            });

            if (nextKey === COMPLETION_KEY) {
              const steps = depth + 1;
              if (!found || steps < minSteps) {
                minSteps = steps;
                solutions.length = 0;
                found = true;
              }
              if (steps === minSteps) {
                solutions.push(nextKey);
              }
            } else if (depth + 1 < minSteps) {
              queue.push(next);
            }
          } else if (nextKey === COMPLETION_KEY) {
            const steps = depth + 1;
            if (!found || steps < minSteps) {
              minSteps = steps;
              solutions.length = 0;
              found = true;
            }
            if (steps === minSteps) {
              solutions.push(nextKey);
            }
          }
        }
      }

      if (found && depth + 1 >= minSteps) break;
    }

    if (!found) {
      return { solvable: false, steps: -1, moves: [], pathCount: 0 };
    }

    if (!findPaths) {
      const path = [];
      let current = solutions[0];
      while (current !== startKey) {
        const info = visited.get(current);
        path.unshift({ srcIdx: info.srcIdx, dstIdx: info.dstIdx });
        current = info.parent;
      }
      return {
        solvable: true,
        steps: minSteps,
        moves: path,
        pathCount: solutions.length
      };
    }

    const allPaths = [];
    const seen = new Set();
    for (const solKey of solutions) {
      const path = [];
      let current = solKey;
      while (current !== startKey) {
        const info = visited.get(current);
        path.unshift({ srcIdx: info.srcIdx, dstIdx: info.dstIdx });
        current = info.parent;
      }
      const pkey = path.map(m => m.srcIdx + "-" + m.dstIdx).join("|");
      if (!seen.has(pkey)) {
        seen.add(pkey);
        allPaths.push(path);
      }
    }

    return {
      solvable: true,
      steps: minSteps,
      moves: allPaths[0],
      pathCount: allPaths.length,
      allPaths
    };
  }

  function bfsSolve(tubes, maxSteps) {
    return bfsSolveFast(tubes, maxSteps || 60, true);
  }

  function bfsCheckMinSteps(tubes, threshold) {
    const result = bfsSolveFast(tubes, threshold, false);
    return {
      found: result.solvable && result.steps < threshold,
      steps: result.solvable ? result.steps : -1
    };
  }

  class Tube {
    constructor(colors) {
      this.colors = colors || [];
    }

    clone() {
      return new Tube([...this.colors]);
    }

    get topColor() {
      return this.colors.length > 0 ? this.colors[this.colors.length - 1] : null;
    }

    get topCount() {
      if (this.colors.length === 0) return 0;
      const top = this.topColor;
      let count = 0;
      for (let i = this.colors.length - 1; i >= 0; i--) {
        if (this.colors[i] === top) count++;
        else break;
      }
      return count;
    }

    get isEmpty() {
      return this.colors.length === 0;
    }

    get isFull() {
      return this.colors.length >= TUBE_CAPACITY;
    }

    get availableSpace() {
      return TUBE_CAPACITY - this.colors.length;
    }

    get isComplete() {
      if (this.colors.length === 0) return true;
      if (this.colors.length !== TUBE_CAPACITY) return false;
      return this.colors.every(c => c === this.colors[0]);
    }

    canReceive(color) {
      if (this.isFull) return false;
      if (this.isEmpty) return true;
      return this.topColor === color;
    }

    pourFrom(source) {
      const moveCount = Math.min(source.topCount, this.availableSpace);
      if (moveCount === 0) return 0;
      const color = source.topColor;
      for (let i = 0; i < moveCount; i++) {
        source.colors.pop();
        this.colors.push(color);
      }
      return moveCount;
    }

    toKey() {
      return this.colors.join(",") || "_";
    }
  }

  function stateHash(tubes) {
    return tubes.map(t => t.toKey()).join("|");
  }

  function stateFromHash(hash) {
    return hash.split("|").map(part => {
      if (part === "_" || part === "") return new Tube([]);
      return new Tube(part.split(",").map(Number));
    });
  }

  function isWon(tubes) {
    const seenColors = new Set();
    for (const tube of tubes) {
      if (tube.isEmpty) continue;
      if (!tube.isComplete) return false;
      const c = tube.topColor;
      if (seenColors.has(c)) return false;
      seenColors.add(c);
    }
    return seenColors.size === NUM_COLORS;
  }

  function cloneTubes(tubes) {
    return tubes.map(t => t.clone());
  }

  function generateCompletionState() {
    const tubes = [];
    for (let i = 0; i < NUM_COLORS; i++) {
      tubes.push(new Tube([i, i, i, i]));
    }
    for (let i = 0; i < NUM_EMPTY; i++) {
      tubes.push(new Tube([]));
    }
    return tubes;
  }

  function randomValidMove(tubes) {
    const candidates = [];
    for (let srcIdx = 0; srcIdx < tubes.length; srcIdx++) {
      const src = tubes[srcIdx];
      if (src.isEmpty) continue;
      for (let dstIdx = 0; dstIdx < tubes.length; dstIdx++) {
        if (srcIdx === dstIdx) continue;
        const dst = tubes[dstIdx];
        if (dst.canReceive(src.topColor)) {
          candidates.push({ srcIdx, dstIdx });
        }
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  function smartScramble(tubes, rounds) {
    for (let r = 0; r < rounds; r++) {
      const order = [...Array(NUM_TUBES).keys()];
      for (let i = order.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [order[i], order[j]] = [order[j], order[i]];
      }

      for (const srcIdx of order) {
        const src = tubes[srcIdx];
        if (src.isEmpty) continue;

        const dstOptions = [];
        for (let dstIdx = 0; dstIdx < NUM_TUBES; dstIdx++) {
          if (srcIdx === dstIdx) continue;
          const dst = tubes[dstIdx];
          if (!dst.canReceive(src.topColor)) continue;
          if (dst.isEmpty || dst.topColor !== src.topColor) {
            dstOptions.push({ idx: dstIdx, mixed: !dst.isEmpty && dst.topColor !== src.topColor });
          }
        }

        if (dstOptions.length === 0) continue;

        const mixedOptions = dstOptions.filter(o => o.mixed);
        const pick = mixedOptions.length > 0
          ? mixedOptions[Math.floor(Math.random() * mixedOptions.length)]
          : dstOptions[Math.floor(Math.random() * dstOptions.length)];

        tubes[pick.idx].pourFrom(tubes[srcIdx]);
      }
    }
    return tubes;
  }

  function randomizeTubes(moveCount) {
    const tubes = generateCompletionState();
    for (let i = 0; i < moveCount; i++) {
      const move = randomValidMove(tubes);
      if (!move) break;
      tubes[move.dstIdx].pourFrom(tubes[move.srcIdx]);
    }
    return tubes;
  }

  function countSingleColorTubes(tubes) {
    let count = 0;
    for (const tube of tubes) {
      if (tube.isEmpty) continue;
      if (tube.isComplete) count++;
    }
    return count;
  }

  function countDistractorColors(tubes) {
    const colorPositions = {};
    for (let i = 0; i < NUM_TUBES; i++) {
      const tube = tubes[i];
      for (let j = 0; j < tube.colors.length; j++) {
        const color = tube.colors[j];
        if (!colorPositions[color]) colorPositions[color] = [];
        colorPositions[color].push({ tubeIdx: i, layerIdx: j });
      }
    }

    let distractors = 0;
    for (const color of Object.keys(colorPositions)) {
      const positions = colorPositions[color];
      const allSameTube = positions.every(p => p.tubeIdx === positions[0].tubeIdx);
      const canDirectlyMove = positions.some(p => {
        const tube = tubes[p.tubeIdx];
        if (tube.topColor === parseInt(color)) {
          for (let t = 0; t < NUM_TUBES; t++) {
            if (t === p.tubeIdx) continue;
            if (tubes[t].isEmpty || tubes[t].topColor === parseInt(color)) {
              return true;
            }
          }
        }
        return false;
      });

      if (!allSameTube) distractors++;
      else if (!canDirectlyMove && positions.length > 1) distractors++;
    }
    return distractors;
  }

  function detectTraps(tubes) {
    const result = bfsSolveFast(tubes, 60, false);
    if (!result.solvable) return { hasTraps: false, trapMoves: [] };

    const trapMoves = [];
    for (let srcIdx = 0; srcIdx < NUM_TUBES; srcIdx++) {
      const src = tubes[srcIdx];
      if (src.isEmpty) continue;
      for (let dstIdx = 0; dstIdx < NUM_TUBES; dstIdx++) {
        if (srcIdx === dstIdx) continue;
        const dst = tubes[dstIdx];
        if (!dst.canReceive(src.topColor)) continue;

        const cloned = cloneTubes(tubes);
        cloned[dstIdx].pourFrom(cloned[srcIdx]);
        const afterResult = bfsSolveFast(cloned, 60, false);
        if (!afterResult.solvable) {
          trapMoves.push({ srcIdx, dstIdx });
        }
      }
    }
    return { hasTraps: trapMoves.length > 0, trapMoves };
  }

  function evaluateLevel(tubes) {
    const result = bfsSolveFast(tubes, 50, false);
    const singleColorCount = countSingleColorTubes(tubes);
    const distractors = countDistractorColors(tubes);

    return {
      optimalSteps: result.solvable ? result.steps : -1,
      solvable: result.solvable,
      singleColorCount,
      distractorCount: distractors,
      pathCount: result.pathCount,
      hasTraps: false,
      moves: result.moves || []
    };
  }

  function createSeededState(rng) {
    const pool = [];
    for (let c = 0; c < NUM_COLORS; c++) {
      for (let i = 0; i < TUBE_CAPACITY; i++) {
        pool.push(c);
      }
    }

    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const tubes = [];
    for (let i = 0; i < NUM_TUBES; i++) {
      tubes.push(new Tube([]));
    }

    let idx = 0;
    for (const color of pool) {
      while (idx < NUM_TUBES && tubes[idx].isFull) idx++;
      if (idx >= NUM_TUBES) break;
      tubes[idx].colors.push(color);
    }

    return tubes;
  }

  function createRandomState() {
    return createSeededState(Math.random);
  }

  function isValidInitialState(tubes) {
    if (isWon(tubes)) return false;

    if (countSingleColorTubes(tubes) > 0) return false;

    const colorTubes = new Array(NUM_COLORS).fill(0).map(() => new Set());
    for (let i = 0; i < tubes.length; i++) {
      for (const c of tubes[i].colors) {
        colorTubes[c].add(i);
      }
    }
    for (let c = 0; c < NUM_COLORS; c++) {
      if (colorTubes[c].size < 2) return false;
    }

    return true;
  }

  function generateLevelSync() {
    console.time("levelgen");
    for (let attempt = 0; attempt < 200; attempt++) {
      const tubes = createRandomState();
      if (!isValidInitialState(tubes)) continue;
      if (countDistractorColors(tubes) < 3) continue;
      const check = bfsCheckMinSteps(tubes, 25);
      if (check.found) continue;
      const result = bfsSolveFast(tubes, 60, false);
      if (!result.solvable) continue;
      console.timeEnd("levelgen");
      return {
        tubes,
        evaluation: {
          optimalSteps: result.steps,
          solvable: true,
          singleColorCount: 0,
          distractorCount: countDistractorColors(tubes),
          pathCount: result.pathCount,
          hasTraps: false,
          trapsCount: 0,
          moves: result.moves,
          allPaths: [result.moves]
        }
      };
    }
    console.timeEnd("levelgen");
    return null;
  }

  function generateLevelQuick(levelNum) {
    const seed = hashSeed(levelNum || 1);
    const rng = mulberry32(seed);

    for (let attempt = 0; attempt < 200; attempt++) {
      const tubes = createSeededState(rng);
      if (!isValidInitialState(tubes)) continue;
      if (countDistractorColors(tubes) < 3) continue;
      return {
        tubes,
        evaluation: {
          optimalSteps: -1,
          solvable: true,
          singleColorCount: 0,
          distractorCount: countDistractorColors(tubes),
          pathCount: 1,
          hasTraps: false,
          trapsCount: 0,
          moves: [],
          allPaths: []
        }
      };
    }

    const tubes = createSeededState(rng);
    return {
      tubes,
      evaluation: {
        optimalSteps: -1,
        solvable: true,
        singleColorCount: countSingleColorTubes(tubes),
        distractorCount: countDistractorColors(tubes),
        pathCount: 1,
        hasTraps: false,
        trapsCount: 0,
        moves: [],
        allPaths: []
      }
    };
  }

  function getHint(tubesState) {
    const result = bfsSolveFast(cloneTubes(tubesState), 40, false);
    if (!result.solvable || !result.moves || result.moves.length === 0) return null;
    return result.moves[0];
  }

  function tubesToData(tubes) {
    return tubes.map(t => [...t.colors]);
  }

  function dataToTubes(data) {
    return data.map(arr => new Tube([...arr]));
  }

  const api = {
    Tube,
    TUBE_CAPACITY,
    NUM_COLORS,
    NUM_EMPTY,
    NUM_TUBES,
    COLORS,
    COLOR_NAMES,
    stateHash,
    stateFromHash,
    isWon,
    cloneTubes,
    generateCompletionState,
    randomizeTubes,
    smartScramble,
    createSeededState,
    createRandomState,
    isValidInitialState,
    mulberry32,
    hashSeed,
    bfsSolve,
    bfsSolveFast,
    bfsCheckMinSteps,
    detectTraps,
    countSingleColorTubes,
    countDistractorColors,
    evaluateLevel,
    generateLevelSync,
    generateLevelQuick,
    getHint,
    tubesToData,
    dataToTubes
  };

  if (typeof window !== "undefined") {
    window.WaterSort = api;
  }
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
