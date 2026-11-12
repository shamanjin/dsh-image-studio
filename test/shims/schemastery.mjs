/** 测试用最小 schemastery 替身：只实现插件里用到的链式 API。 */
function field(type) {
  const node = {
    type,
    _default: undefined,
    default(value) {
      node._default = value;
      return node;
    },
    role(_role) {
      return node;
    },
    volatile() {
      node._volatile = true;
      return node;
    },
    description(_text) {
      return node;
    },
    min() {
      return node;
    },
    step() {
      return node;
    },
  };
  return node;
}

const z = {
  string: () => field('string'),
  number: () => field('number'),
  boolean: () => field('boolean'),
  object: (shape) => ({ type: 'object', shape }),
};

export default z;
