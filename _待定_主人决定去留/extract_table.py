import re
import json

with open(r'D:\soli\宝石学整理\单晶矿物种宝石_矿标综合参考表.md', 'r', encoding='utf-8') as f:
    content = f.read()

# 找到所有Markdown表格
table_pattern = r'\|.*\|'
tables = re.findall(r'\|.*\|', content)

# 提取矿物名称、硬度、稀缺性
minerals = []
for line in content.split('\n'):
    if line.startswith('|') and '矿物' not in line and '------' not in line:
        # 清洗行
        line = line.strip()
        if line.count('|') >= 3:
            parts = [p.strip() for p in line.split('|') if p.strip()]
            if len(parts) >= 3:
                mineral = parts[0]
                hardness = parts[1]
                scarcity = parts[2]
                minerals.append((mineral, hardness, scarcity))

# 去重：以矿物名称为键
unique = {}
for mineral, hardness, scarcity in minerals:
    # 清理矿物名称：去除括号内的别名
    name = re.sub(r'\（.*?\）', '', mineral)  # 中文括号
    name = re.sub(r'\(.*?\)', '', name)      # 英文括号
    name = name.strip()
    if not name:
        continue
    # 如果已经存在，保留第一个（或合并硬度？）
    if name not in unique:
        unique[name] = (hardness, scarcity)
    else:
        # 合并硬度范围
        pass

print(f"找到 {len(unique)} 个唯一矿物")
for name, (hardness, scarcity) in sorted(unique.items()):
    print(f"{name}: 硬度 {hardness}, 稀缺性 {scarcity}")

# 输出为JSON
with open(r'D:\soli\宝石学整理\minerals.json', 'w', encoding='utf-8') as f:
    json.dump([{'name': k, 'hardness': v[0], 'scarcity': v[1]} for k, v in unique.items()], f, ensure_ascii=False, indent=2)