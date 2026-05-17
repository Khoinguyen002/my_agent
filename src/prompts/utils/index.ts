export function serializeObject(obj: any, indent = 2): string {
  const pad = (level: number) => ' '.repeat(level);

  if (obj === null) return 'null';
  if (typeof obj === 'number' || typeof obj === 'boolean') return obj.toString();
  if (typeof obj === 'string') return `"${obj}"`; // string là description

  if (Array.isArray(obj)) {
    const arrItems = obj.map((v) => `${pad(indent)}${serializeObject(v, indent + 2)}`);
    return `[\n${arrItems.join(',\n')}\n${pad(indent - 2)}]`;
  }

  // object
  const entries = Object.entries(obj).map(([key, value]) => {
    return `${pad(indent)}"${key}": ${serializeObject(value, indent + 2)}`;
  });
  return `{\n${entries.join(',\n')}\n${pad(indent - 2)}}`;
}
