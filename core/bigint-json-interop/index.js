const prepare = object => {
  return JSON.parse(
    JSON.stringify(object, (_key, value) => {
      if (typeof value === "bigint") {
        return { type: "bigint", value: String(value) };
      }

      return value;
    })
  );
};

const unprepare = object => {
  return JSON.parse(JSON.stringify(object), (_key, value) => {
    if (typeof value !== "object" || value === null) {
      return value;
    }

    if (value.type === "bigint") {
      return BigInt(value.value);
    }

    return value;
  });
};

module.exports = { prepare, unprepare };
