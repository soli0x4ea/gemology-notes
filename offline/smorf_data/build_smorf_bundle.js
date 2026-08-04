const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = __dirname;

// struct名 -> JSON文件映射
const STRUCT_TO_FILE = {
  'diamond': 'diamond_015.json',
  'corundum': 'corundum_d2.json',
  'beryl': 'beryl_012.json',
  'chrysoberyl': 'chrysoberyl_d1.json',
  'spinel': 'spinel_01.json',
  'topaz': 'topaz_188.json',
  'forsterite': 'olivine_031.json',
  'quartz': 'quartz_007.json',
  'fluorite': 'fluorite_001.json',
  'zircon': 'zircon_024.json',
  'calcite': 'calcite_0002.json',
  'rhodochrosite': 'rhodochrosite_07.json',
  'kyanite': 'kyanite_06.json',
  'benitoite': 'benitoite_1.json',
  'cordierite': 'cordierite_07.json',
  'danburite': 'danburite_40.json',
  'diopside': 'diopside_135.json',
  'elbaite': 'tourmaline_004.json',
  'fluorapatite': 'apatite_001.json',
  'meionite': 'scapolite_30.json',
  'microcline': 'microcline_mh290.json',
  'phenakite': 'phenakite_034.json',
  'pyrope': 'garnet_01.json',
  'zoisite': 'zoisite_04.json'
};

const SMORF_DATA = {};

for (const [struct, filename] of Object.entries(STRUCT_TO_FILE)) {
  const filePath = path.join(OUTPUT_DIR, filename);
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    SMORF_DATA[struct] = data;
    console.log(`Added ${struct} from ${filename}: ${data.positions.length/3} verts, ${data.indices.length/3} tris`);
  } else {
    console.warn(`Missing file for ${struct}: ${filename}`);
  }
}

// 生成JS文件
const jsContent = `// Smorf crystal data bundle - generated from smorf.nl
// Data source: https://smorf.nl (free for personal/commercial use per site license)
const SMORF_DATA = ${JSON.stringify(SMORF_DATA)};
`;

const outPath = path.join(OUTPUT_DIR, 'smorf_bundle.js');
fs.writeFileSync(outPath, jsContent);
console.log(`\nBundle written to ${outPath}`);
console.log(`Total structs: ${Object.keys(SMORF_DATA).length}`);
const stats = fs.statSync(outPath);
console.log(`Bundle size: ${(stats.size / 1024).toFixed(1)} KB`);
