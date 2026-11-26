// How strong is this computer? (Since v0.78.) With the Graphics setting on Auto, the game starts
// at the level this says, then keeps an eye on how smoothly it's really running (see main.js) and
// turns things down a step if it's struggling. Nothing here leaves this computer.

export const LEVELS = ['lowest', 'low', 'medium', 'high']; // (slowest first)
export const LEVEL_NAMES = { lowest: 'Lowest', low: 'Low', medium: 'Medium', high: 'High' };

const rank = level => Math.max(0, LEVELS.indexOf(level));
export const lowerOf = (a, b) => LEVELS[Math.min(rank(a), rank(b))];
export const stepDown = level => LEVELS[Math.max(0, rank(level) - 1)];

// No real graphics chip at all: the computer's processor draws everything (very slow).
const SOFTWARE = /swiftshader|llvmpipe|softpipe|software|basic render|mesa offscreen/i;
// Older or basic built-in graphics: fine for Low, not for the shiny stuff.
const WEAK = /intel.*(hd graphics|gma|haswell|ivybridge|bay ?trail|atom)|mali-[2-7]\d\d|mali-t|adreno.*\b[2-5]\d\d\b|powervr|videocore|vivante/i;

// gpu: the graphics chip's name ('' if unknown); cores, memory (GB): undefined if unknown.
export function levelFor({ gpu = '', cores, memory, touch = false } = {}) {
  let level = 'high';
  if (SOFTWARE.test(gpu)) return 'lowest';
  if (WEAK.test(gpu)) level = lowerOf(level, 'low');
  if ((cores && cores <= 2) || (memory && memory <= 2)) return 'lowest';
  if ((cores && cores <= 4) || (memory && memory <= 4)) level = lowerOf(level, 'medium');
  if (touch) level = lowerOf(level, 'low');
  return level;
}

// The name of this computer's graphics chip, if the browser will say.
export function gpuName() {
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return 'software (no WebGL)';
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String((info && gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) || gl.getParameter(gl.RENDERER) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return name;
  } catch {
    return '';
  }
}

export function detectPower(touch = false) {
  const gpu = gpuName();
  return { gpu, level: levelFor({ gpu, cores: navigator.hardwareConcurrency, memory: navigator.deviceMemory, touch }) };
}
