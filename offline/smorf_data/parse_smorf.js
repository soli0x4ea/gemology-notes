const fs = require('fs');
const path = require('path');
const https = require('https');

const SMORF_BASE = 'https://smorf.nl/__crystals/';
const OUTPUT_DIR = __dirname;

// 宝石学笔记涉及的矿物映射：中文名 -> 选中的典型晶体
const SELECTED_CRYSTALS = {
  '钻石': 'Diamond_015',
  '刚玉': 'Corundum_D2',
  '绿柱石': 'Beryl_012',
  '金绿宝石': 'Chrysoberyl_D1',
  '尖晶石': 'Spinel_01',
  '托帕石': 'Topaz_188',
  '橄榄石': 'Olivine_031',
  '水晶': 'Quartz_007',
  '萤石': 'Fluorite_001',
  '锆石': 'Zircon_024',
  '方解石': 'Calcite_0002',
  '菱锰矿': 'Rhodochrosite_07',
  '蓝晶石': 'Kyanite_06',
  '蓝锥矿': 'Benitoite_1',
  '堇青石': 'Cordierite_07',
  '赛黄晶': 'Danburite_40',
  '透辉石': 'Diopside_135',
  '电气石': 'Tourmaline_004',
  '磷灰石': 'Apatite_001',
  '方柱石': 'Scapolite_30',
  '微斜长石': 'Microcline_MH290',
  '硅铍石': 'Phenakite_034',
  '石榴石': 'Garnet_01',
  '黝帘石': 'Zoisite_04'
};

function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

// 正确的Smorf二进制解析器（从smorf3d.js反编译）
function parseSmorfBin(buffer) {
  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  let offset = 0;

  // 晶轴夹角
  const alfa = view.getFloat32(offset, false); offset += 4;
  const beta = view.getFloat32(offset, false); offset += 4;
  const gamma = view.getFloat32(offset, false); offset += 4;

  // 颜色分量（r,g,b）
  const r = view.getInt16(offset, false); offset += 2;
  const g = view.getInt16(offset, false); offset += 2;
  const b = view.getInt16(offset, false); offset += 2;

  // 一个未使用的float
  const unused = view.getFloat32(offset, false); offset += 4;

  // 顶点
  const numVertices = view.getInt16(offset, false); offset += 2;
  const vertices = [];
  for (let i = 0; i < numVertices; i++) {
    const x = view.getFloat32(offset, false); offset += 4;
    const y = view.getFloat32(offset, false); offset += 4;
    const z = -view.getFloat32(offset, false); offset += 4;  // z取反
    vertices.push(x, y, z);
  }

  // 四边形面（真实晶面）
  const numQuads = view.getInt16(offset, false); offset += 2;
  const quadFaces = [];
  for (let i = 0; i < numQuads; i++) {
    const i1 = view.getInt16(offset, false); offset += 2;
    const i2 = view.getInt16(offset, false); offset += 2;
    const i3 = view.getInt16(offset, false); offset += 2;
    const i4 = view.getInt16(offset, false); offset += 2;
    // 注意：主mesh中顺序是 (i1, i4, i3, i2)
    quadFaces.push([i1, i4, i3, i2]);
  }

  // 三角面
  const numTris = view.getInt16(offset, false); offset += 2;
  const triFaces = [];
  for (let i = 0; i < numTris; i++) {
    const i1 = view.getInt16(offset, false); offset += 2;
    const i2 = view.getInt16(offset, false); offset += 2;
    const i3 = view.getInt16(offset, false); offset += 2;
    // 主mesh中顺序是 (i1, i3, i2)
    triFaces.push([i1, i3, i2]);
  }

  // 边（线框，多段线）
  const numEdges = view.getInt16(offset, false); offset += 2;
  const edges = [];
  for (let i = 0; i < numEdges; i++) {
    const polyline = [];
    let first = view.getInt16(offset, false); offset += 2;
    let next = view.getInt16(offset, false); offset += 2;
    polyline.push(first, next);
    while (true) {
      next = view.getInt16(offset, false); offset += 2;
      if (next === -1) break;
      polyline.push(next);
    }
    edges.push(polyline);
  }

  // Miller指数标签
  const numMillers = view.getInt16(offset, false); offset += 2;
  const millerLabels = [];
  for (let i = 0; i < numMillers; i++) {
    const h = view.getInt8(offset); offset += 1;
    const k = view.getInt8(offset); offset += 1;
    const l = view.getInt8(offset); offset += 1;
    const lx = view.getFloat32(offset, false); offset += 4;
    const ly = view.getFloat32(offset, false); offset += 4;
    const lz = -view.getFloat32(offset, false); offset += 4;
    millerLabels.push({ h, k, l, pos: [lx, ly, lz] });
  }

  return {
    cellAngles: { alfa, beta, gamma },
    color: { r, g, b },
    vertices,
    quadFaces,
    triFaces,
    edges,
    millerLabels,
    counts: {
      vertices: numVertices,
      quadFaces: numQuads,
      triFaces: numTris,
      edges: numEdges,
      millerLabels: numMillers
    }
  };
}

// 转换为Three.js BufferGeometry可用格式
function toThreeJson(parsed) {
  const positions = [];
  const indices = [];

  const verts = parsed.vertices;

  // 添加四边形面（三角化为两个三角形）
  for (const face of parsed.quadFaces) {
    const [a, b, c, d] = face;
    const baseIdx = positions.length / 3;
    // 添加四个顶点
    for (const vi of face) {
      const i3 = vi * 3;
      positions.push(verts[i3], verts[i3 + 1], verts[i3 + 2]);
    }
    // 三角形1: a,b,c
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
    // 三角形2: a,c,d
    indices.push(baseIdx, baseIdx + 2, baseIdx + 3);
  }

  // 添加三角面
  for (const face of parsed.triFaces) {
    const baseIdx = positions.length / 3;
    for (const vi of face) {
      const i3 = vi * 3;
      positions.push(verts[i3], verts[i3 + 1], verts[i3 + 2]);
    }
    indices.push(baseIdx, baseIdx + 1, baseIdx + 2);
  }

  // 中心化和归一化
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
  }
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const cz = (minZ + maxZ) / 2;
  const size = Math.max(maxX - minX, maxY - minY, maxZ - minZ);
  const scale = 2 / size;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * scale;
    positions[i + 1] = (positions[i + 1] - cy) * scale;
    positions[i + 2] = (positions[i + 2] - cz) * scale;
  }

  // 计算法向量
  const normals = new Array(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const i0 = indices[i] * 3;
    const i1 = indices[i + 1] * 3;
    const i2 = indices[i + 2] * 3;
    const ax = positions[i1] - positions[i0], ay = positions[i1 + 1] - positions[i0 + 1], az = positions[i1 + 2] - positions[i0 + 2];
    const bx = positions[i2] - positions[i0], by = positions[i2 + 1] - positions[i0 + 1], bz = positions[i2 + 2] - positions[i0 + 2];
    const nx = ay * bz - az * by;
    const ny = az * bx - ax * bz;
    const nz = ax * by - ay * bx;
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      for (let j = 0; j < 3; j++) {
        const idx = indices[i + j] * 3;
        normals[idx] += nx / len;
        normals[idx + 1] += ny / len;
        normals[idx + 2] += nz / len;
      }
    }
  }
  // 归一化法向量
  for (let i = 0; i < normals.length; i += 3) {
    const nx = normals[i], ny = normals[i + 1], nz = normals[i + 2];
    const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
    if (len > 0) {
      normals[i] = nx / len;
      normals[i + 1] = ny / len;
      normals[i + 2] = nz / len;
    }
  }

  // 提取Miller指数
  const millerIndices = parsed.millerLabels.map(m => [m.h, m.k, m.l]);

  return {
    positions,
    normals,
    indices,
    millerIndices,
    edges: parsed.edges,
    metadata: {
      source: 'smorf.nl',
      cellAngles: parsed.cellAngles,
      color: parsed.color,
      counts: parsed.counts
    }
  };
}

async function main() {
  const mineralMap = {};

  for (const [cnName, crystalFile] of Object.entries(SELECTED_CRYSTALS)) {
    console.log(`Processing ${cnName} -> ${crystalFile}...`);
    try {
      const binUrl = SMORF_BASE + crystalFile + '.smorf.bin';
      const binPath = path.join(OUTPUT_DIR, crystalFile + '.smorf.bin');
      const jsonPath = path.join(OUTPUT_DIR, crystalFile.toLowerCase() + '.json');

      // 下载二进制文件
      if (!fs.existsSync(binPath)) {
        await downloadFile(binUrl, binPath);
        console.log(`  Downloaded ${crystalFile}.smorf.bin`);
      } else {
        console.log(`  ${crystalFile}.smorf.bin already exists, skipping download`);
      }

      // 读取并解析
      const buf = fs.readFileSync(binPath);
      const parsed = parseSmorfBin(buf);
      const threeData = toThreeJson(parsed);

      // 保存JSON
      fs.writeFileSync(jsonPath, JSON.stringify(threeData));
      console.log(`  Saved ${crystalFile.toLowerCase()}.json - ${threeData.positions.length / 3} verts, ${threeData.indices.length / 3} tris`);

      mineralMap[cnName] = {
        smorfName: crystalFile.split('_')[0],
        crystalFile: crystalFile,
        jsonFile: crystalFile.toLowerCase() + '.json',
        binFile: crystalFile + '.smorf.bin',
        counts: parsed.counts
      };
    } catch (e) {
      console.error(`  Error processing ${cnName}:`, e.message);
      mineralMap[cnName] = { error: e.message };
    }
  }

  // 保存矿物映射表
  const mapPath = path.join(OUTPUT_DIR, 'mineral_map.json');
  fs.writeFileSync(mapPath, JSON.stringify(mineralMap, null, 2));
  console.log(`\nDone! Mineral map saved to ${mapPath}`);
  console.log('Successfully processed:', Object.entries(mineralMap).filter(([k, v]) => !v.error).map(([k]) => k).join(', '));
}

// 如果直接运行此脚本
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { parseSmorfBin, toThreeJson, SELECTED_CRYSTALS };
