// Archive ZIP sans compression, pour distribuer plusieurs pages séparées.
// Script classique (et non module ES), pour que le compilateur marche aussi ouvert depuis le
// disque ; il ajoute ses fonctions à window.PyWimsCompiler, que les autres scripts complètent.
(() => {
  // Construit une archive ZIP sans compression pour distribuer plusieurs pages.
  function createZip(entries) {
    const encoder = new TextEncoder();
    const crc32 = bytes => {
      let crc = 0xffffffff;
      for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit += 1) {
          crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    };
    const header = (size, writes) => {
      const bytes = new Uint8Array(size);
      const view = new DataView(bytes.buffer);
      for (const [offset, value, width] of writes) {
        if (width === 2) view.setUint16(offset, value, true);
        else view.setUint32(offset, value, true);
      }
      return bytes;
    };
    if (entries.length > 0xffff) {
      throw new Error("L’archive contient trop de fichiers.");
    }

    const localParts = [];
    const centralParts = [];
    let localOffset = 0;
    const date = new Date();
    const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
    const dosDate = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
    for (const entry of entries) {
      const name = encoder.encode(entry.name);
      const content = encoder.encode(entry.content);
      if (name.length > 0xffff || content.length > 0xffffffff) {
        throw new Error(`Le fichier « ${entry.name} » dépasse la taille maximale prise en charge.`);
      }
      const checksum = crc32(content);
      const localHeader = header(30, [
        [0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2],
        [10, dosTime, 2], [12, dosDate, 2], [14, checksum, 4],
        [18, content.length, 4], [22, content.length, 4],
        [26, name.length, 2], [28, 0, 2]
      ]);
      localParts.push(localHeader, name, content);
      const centralHeader = header(46, [
        [0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2],
        [10, 0, 2], [12, dosTime, 2], [14, dosDate, 2],
        [16, checksum, 4], [20, content.length, 4], [24, content.length, 4],
        [28, name.length, 2], [30, 0, 2], [32, 0, 2], [34, 0, 2],
        [36, 0, 4], [42, localOffset, 4]
      ]);
      centralParts.push(centralHeader, name);
      localOffset += localHeader.length + name.length + content.length;
    }
    const centralSize = centralParts.reduce((size, part) => size + part.length, 0);
    if (localOffset > 0xffffffff || centralSize > 0xffffffff) {
      throw new Error("L’archive dépasse la taille maximale prise en charge.");
    }
    const end = header(22, [
      [0, 0x06054b50, 4], [4, 0, 2], [6, 0, 2],
      [8, entries.length, 2], [10, entries.length, 2],
      [12, centralSize, 4], [16, localOffset, 4], [20, 0, 2]
    ]);
    return new Blob([...localParts, ...centralParts, end], {
      type: "application/zip"
    });
  }

  window.PyWimsCompiler = Object.freeze({
    ...window.PyWimsCompiler,
    createZip
  });
})();
