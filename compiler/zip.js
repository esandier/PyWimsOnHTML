// Archives ZIP : écriture sans compression, pour distribuer plusieurs pages séparées, et lecture des
// archives de question (.pwqa, .zip : un .pwq et ses images, SPECIFICATION.md, § 2.7).
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
      // Texte (une page) ou octets (une image, dans les tests).
      const content = typeof entry.content === "string" ? encoder.encode(entry.content) : entry.content;
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

  // Lit une archive ZIP : renvoie ses fichiers, [{ name, bytes }], sans les dossiers. Seules les
  // méthodes « stockée » (0) et « deflate » (8) existent en pratique ; deflate est décompressé par
  // le navigateur (DecompressionStream), sans bibliothèque. Solution écartée : une bibliothèque ZIP
  // (JSZip, fflate), à intégrer au site pour une centaine de lignes. Le répertoire central fait
  // foi : les tailles des en-têtes locaux manquent quand l’archive a été écrite en flux (bit 3).
  async function readZip(buffer) {
    const bytes = new Uint8Array(buffer);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    // Fin du répertoire central : 22 octets, suivis d’un commentaire d’au plus 65 535 octets.
    let end = -1;
    for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 22 - 0xffff); offset -= 1) {
      if (view.getUint32(offset, true) === 0x06054b50) {
        end = offset;
        break;
      }
    }
    if (end < 0) {
      throw new Error("ce n’est pas une archive ZIP lisible.");
    }
    const count = view.getUint16(end + 10, true);
    let offset = view.getUint32(end + 16, true);
    if (count === 0xffff || offset === 0xffffffff) {
      throw new Error("les archives ZIP64 ne sont pas prises en charge.");
    }
    const decoder = new TextDecoder();
    const files = [];
    for (let index = 0; index < count; index += 1) {
      if (offset + 46 > bytes.length || view.getUint32(offset, true) !== 0x02014b50) {
        throw new Error("le répertoire de l’archive est abîmé.");
      }
      const flags = view.getUint16(offset + 8, true);
      const method = view.getUint16(offset + 10, true);
      const compressedSize = view.getUint32(offset + 20, true);
      const nameLength = view.getUint16(offset + 28, true);
      const extraLength = view.getUint16(offset + 30, true);
      const commentLength = view.getUint16(offset + 32, true);
      const localOffset = view.getUint32(offset + 42, true);
      // Les noms sont lus en UTF-8 (bit 11, ou noms ASCII) : les rares archives en page de code
      // DOS n’ont d’accents illisibles que dans des noms de fichiers.
      const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
      offset += 46 + nameLength + extraLength + commentLength;
      if (name.endsWith("/")) continue;
      if (flags & 1) {
        throw new Error(`« ${name} » est chiffré dans l’archive.`);
      }
      const dataStart = localOffset + 30 + view.getUint16(localOffset + 26, true) + view.getUint16(localOffset + 28, true);
      const data = bytes.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) {
        files.push({ name, bytes: data });
      } else if (method === 8) {
        const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        files.push({ name, bytes: new Uint8Array(await new Response(stream).arrayBuffer()) });
      } else {
        throw new Error(`« ${name} » est compressé par une méthode non prise en charge (${method}).`);
      }
    }
    return files;
  }

  window.PyWimsCompiler = Object.freeze({
    ...window.PyWimsCompiler,
    createZip,
    readZip
  });
})();
