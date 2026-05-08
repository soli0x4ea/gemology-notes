import re
import json

with open(r'D:\soli\宝石学整理\单晶矿物种宝石_矿标综合参考表.md', 'r', encoding='utf-8') as f:
    content = f.read()

# 定义部分标题
sections = [
    ("一、耐久（Excellent）— 硬度 ≥ 8，无或极少解理", "二、良好（Good）— 硬度 6.5—8，有少量解理或不明显"),
    ("二、良好（Good）— 硬度 6.5—8，有少量解理或不明显", "三、一般（Fair）— 硬度 5.5—7，有明显解理"),
    ("三、一般（Fair）— 硬度 5.5—7，有明显解理", "四、矿标类（Collector Specimens）"),
    ("四、矿标类（Collector Specimens）", "五、极稀有矿物特别说明"),
]

minerals = []
for start, end in sections:
    # 找到部分内容
    pattern = re.escape(start) + r'(.*?)' + re.escape(end)
    match = re.search(pattern, content, re.DOTALL)
    if match:
        section_content = match.group(1)
        # 提取表格行
        lines = section_content.split('\n')
        for line in lines:
            if line.startswith('|') and '矿物' not in line and '------' not in line:
                parts = [p.strip() for p in line.split('|') if p.strip()]
                if len(parts) >= 3:
                    mineral = parts[0]
                    hardness = parts[1]
                    scarcity = parts[2]
                    minerals.append((mineral, hardness, scarcity))

# 去重
unique = {}
for mineral, hardness, scarcity in minerals:
    # 清理名称：去除括号内的别名
    name = re.sub(r'\（.*?\）', '', mineral)
    name = re.sub(r'\(.*?\)', '', name)
    name = name.strip()
    if not name:
        continue
    # 如果名称包含“等”，去掉
    if name.endswith('等'):
        name = name[:-1]
    if name not in unique:
        unique[name] = (hardness, scarcity)
    else:
        # 合并硬度范围？暂时忽略
        pass

print(f"找到 {len(unique)} 个唯一矿物")
for name, (hardness, scarcity) in sorted(unique.items()):
    print(f"{name}: 硬度 {hardness}, 稀缺性 {scarcity}")

# 输出为JSON
with open(r'D:\soli\宝石学整理\minerals_unique.json', 'w', encoding='utf-8') as f:
    json.dump([{'name': k, 'hardness': v[0], 'scarcity': v[1]} for k, v in unique.items()], f, ensure_ascii=False, indent=2)