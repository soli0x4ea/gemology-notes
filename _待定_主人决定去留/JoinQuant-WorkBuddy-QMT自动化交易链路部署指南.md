# JoinQuant → WorkBuddy → QMT 自动化交易链路

> 版本：v1.0 | 日期：2026-04-26

---

## 一、整体架构

```
┌──────────────┐      HTTP POST       ┌──────────────┐      XtQuant API      ┌──────────────┐
│   JoinQuant  │ ──────────────────▶ │  WorkBuddy   │ ───────────────────▶ │     QMT      │
│  （信号源）   │   策略触发信号回调    │  （中转/处理） │      下单指令         │   （执行端）  │
│              │                      │              │                      │              │
│  策略回测     │                      │  风控校验     │                      │  实盘下单     │
│  模拟盘信号   │                      │  格式转换     │                      │  订单管理     │
│  分钟/日级    │                      │  日志记录     │                      │  持仓同步     │
└──────────────┘                      └──────────────┘                      └──────────────┘
```

---

## 二、各环节职责

| 环节 | 职责 | 技术要点 |
|------|------|---------|
| **JoinQuant** | 策略回测验证 + 模拟盘产生交易信号 | Python 策略框架，支持分钟级/日级数据，回测引擎完善 |
| **WorkBuddy** | 接收信号 → 风控校验 → 格式转换 → 转发 | 需搭建 HTTP 接口，Python/FastAPI 实现 |
| **QMT** | 实盘下单执行 | 券商量化交易终端，XtQuant Python API |

---

## 三、环境准备

### 3.1 基础要求

| 组件 | 版本 | 用途 |
|------|------|------|
| Python | ≥ 3.9 | 全链路 Python 实现 |
| 聚宽云 | 量化平台账号 | 策略开发 + 模拟盘 |
| QMT 终端 | 券商提供 | 实盘交易 |
| XtQuant | 最新版 | QMT Python API |

### 3.2 Python 依赖

```bash
# WorkBuddy 中转服务
pip install fastapi uvicorn pydantic aiohttp
pip install httpx pandas numpy
```

### 3.3 端口规划

| 端口 | 服务 | 说明 |
|------|------|------|
| 8000 | WorkBuddy 信号接收服务 | 接收 JoinQuant 回调 |
| 5000 | （可选）Web 管理界面 | 查看信号日志、风控状态 |

---

## 四、JoinQuant 端实现

### 4.1 聚宽模拟盘配置

在聚宽研究平台上创建模拟盘，启用 **webhook 回调** 功能：

```
路径：模拟交易 → 交易设置 → 开启交易信号推送
推送地址：http://你的WorkBuddy地址:8000/signal
```

### 4.2 JoinQuant 信号推送代码

```python
# joinquant_signal_sender.py
# 放在 JoinQuant 研究环境或本地回测框架中使用

import requests
import json
from datetime import datetime

# ============ 配置区 ============
WORKBUDDY_URL = "http://你的WorkBuddy地址:8000/signal"
API_KEY = "your-secret-api-key"  # WorkBuddy 端校验用

# ============ 信号格式 ============
def build_signal(order):
    """
    将聚宽订单转换为标准信号格式
    order: 聚宽订单对象，包含 stock, amount, side 等字段
    """
    return {
        "signal_id": f"{datetime.now().strftime('%Y%m%d%H%M%S')}_{order['stock']}",
        "source": "joinquant",
        "timestamp": datetime.now().isoformat(),
        "order": {
            "stock_code": order["stock"],      # 如 "600519.SH"
            "direction": order["side"],        # "buy" 或 "sell"
            "order_type": order.get("type", "market"),  # "market" 或 "limit"
            "price": order.get("price", 0),    # 限价单价格
            "volume": abs(order["amount"]),     # 买入数量（正数）
        },
        "strategy": {
            "name": "your_strategy_name",
            "version": "v1.0"
        },
        "metadata": {
            "api_key": API_KEY
        }
    }

def send_signal(order):
    """
    发送信号到 WorkBuddy
    """
    signal = build_signal(order)
    try:
        response = requests.post(
            WORKBUDDY_URL,
            json=signal,
            headers={"Content-Type": "application/json"},
            timeout=10
        )
        if response.status_code == 200:
            result = response.json()
            print(f"✅ 信号已推送: {signal['signal_id']} -> {result.get('message', 'OK')}")
            return True
        else:
            print(f"❌ 推送失败: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"❌ 网络错误: {e}")
        return False

# ============ 聚宽策略示例 ============
def initialize(context):
    """初始化策略"""
    context.stocks = ['600519.SH']  # 贵州茅台
    context.target_ratio = 0.3      # 目标持仓比例

def handle_data(context, data):
    """每日执行"""
    for stock in context.stocks:
        # 示例：简单均线策略
        ma5 = data[stock].mavg(5, "close")
        ma20 = data[stock].mavg(20, "close")
        
        current_ratio = context.portfolio.positions[stock].amount / context.portfolio.total_value
        
        if ma5 > ma20 and current_ratio < context.target_ratio:
            # 买入信号
            order = {
                "stock": stock,
                "side": "buy",
                "type": "market",
                "amount": 100  # 股数
            }
            send_signal(order)
            
        elif ma5 < ma20 and current_ratio > 0:
            # 卖出信号
            order = {
                "stock": stock,
                "side": "sell",
                "type": "market",
                "amount": -context.portfolio.positions[stock].amount
            }
            send_signal(order)
```

### 4.3 JoinQuant 模拟盘 webhook 模式（推荐）

如果使用聚宽的模拟盘 webhook 功能，只需在策略中调用：

```python
# 开启 webhook 后，聚宽自动推送，无需手动发送
# 但需要 WorkBuddy 端提供公开可访问的地址

# 如果需要内网穿透，可使用 ngrok：
# ngrok http 8000
```

---

## 五、WorkBuddy 中转服务实现

### 5.1 项目结构

```
workbuddy-trading/
├── main.py                 # FastAPI 主程序
├── config.py               # 配置文件
├── routers/
│   ├── signal.py           # 信号接收路由
│   └── status.py           # 状态查询路由
├── services/
│   ├── risk_control.py     # 风控校验服务
│   ├── format_converter.py  # 格式转换服务
│   └── logger.py           # 日志服务
├── models/
│   └── signal.py           # 数据模型
├── qmt/
│   └── executor.py         # QMT 执行器（可选嵌入）
└── requirements.txt
```

### 5.2 核心代码

#### 5.2.1 main.py

```python
# main.py
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, Literal
from datetime import datetime
import uvicorn
import json
import os

from routers import signal, status
from services.risk_control import RiskController
from services.logger import SignalLogger

# ============ 初始化 ============
app = FastAPI(title="Trading Signal Hub", version="1.0.0")
logger = SignalLogger()
risk_ctrl = RiskController()

# ============ CORS ============
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 生产环境建议限制
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============ 注册路由 ============
app.include_router(signal.router)
app.include_router(status.router)

# ============ 健康检查 ============
@app.get("/health")
async def health_check():
    return {"status": "healthy", "timestamp": datetime.now().isoformat()}

# ============ 启动 ============
if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
```

#### 5.2.2 信号模型 models/signal.py

```python
# models/signal.py
from pydantic import BaseModel, Field
from typing import Literal, Optional
from datetime import datetime
from enum import Enum

class Direction(str, Enum):
    BUY = "buy"
    SELL = "sell"

class OrderType(str, Enum):
    MARKET = "market"    # 市价单
    LIMIT = "limit"     # 限价单

class Order(BaseModel):
    stock_code: str = Field(..., description="股票代码，如 600519.SH")
    direction: Direction
    order_type: OrderType = OrderType.MARKET
    price: Optional[float] = 0
    volume: int = Field(..., gt=0, description="股数，必须为正")

class Strategy(BaseModel):
    name: str
    version: str = "v1.0"

class Signal(BaseModel):
    signal_id: str
    source: str = "joinquant"
    timestamp: str
    order: Order
    strategy: Strategy
    metadata: dict = {}

class SignalResponse(BaseModel):
    success: bool
    signal_id: str
    message: str
    risk_check: Optional[dict] = None
    order_id: Optional[str] = None
```

#### 5.2.3 风控校验 services/risk_control.py

```python
# services/risk_control.py
"""
风控校验服务
"""
from typing import Optional
from datetime import datetime, time
from models.signal import Signal, Order, Direction

class RiskController:
    def __init__(self):
        # ============ 风控参数 ============
        self.max_single_order_value = 500000    # 单笔最大金额（元）
        self.max_daily_orders = 50              # 日最大下单次数
        self.max_position_ratio = 0.3            # 单只股票最大持仓比例
        self.min_order_interval = 3             # 最小下单间隔（秒）
        
        # ============ 禁止交易列表 ============
        self.forbidden_stocks = [
            "688001.SH",  # 示例：科创板新股（可能有特殊限制）
        ]
        
        # ============ 交易时间限制 ============
        self.trading_hours = [
            (time(9, 30), time(11, 30)),  # 上午
            (time(13, 0), time(15, 0)),   # 下午
        ]
        
        # ============ 统计 ============
        self.daily_order_count = 0
        self.last_order_time = None
        self.daily_orders_value = 0
    
    def is_trading_time(self) -> bool:
        """检查是否在交易时间"""
        now = datetime.now().time()
        for start, end in self.trading_hours:
            if start <= now <= end:
                return True
        return False
    
    def check_single_order(self, order: Order) -> tuple[bool, str]:
        """检查单笔订单"""
        # 1. 检查股票代码格式
        if not order.stock_code or "." not in order.stock_code:
            return False, f"股票代码格式错误: {order.stock_code}"
        
        # 2. 检查是否在禁止列表
        if order.stock_code in self.forbidden_stocks:
            return False, f"股票 {order.stock_code} 在禁止交易列表"
        
        # 3. 估算订单金额
        estimated_value = order.volume * (order.price if order.price > 0 else 100)  # 无价格按100估算
        if estimated_value > self.max_single_order_value:
            return False, f"单笔金额超限: {estimated_value} > {self.max_single_order_value}"
        
        # 4. 检查下单间隔
        if self.last_order_time:
            interval = (datetime.now() - self.last_order_time).total_seconds()
            if interval < self.min_order_interval:
                return False, f"下单间隔太短: {interval:.1f}秒 < {self.min_order_interval}秒"
        
        return True, "通过"
    
    def check_daily_limit(self) -> tuple[bool, str]:
        """检查日限额"""
        if self.daily_order_count >= self.max_daily_orders:
            return False, f"日下单次数超限: {self.daily_order_count} >= {self.max_daily_orders}"
        return True, "通过"
    
    def validate(self, signal: Signal) -> tuple[bool, str, dict]:
        """
        综合风控校验
        返回: (是否通过, 消息, 详细信息)
        """
        details = {
            "trading_time_check": False,
            "single_order_check": False,
            "daily_limit_check": False,
            "forbidden_check": False,
        }
        
        # 1. 交易时间检查（仅工作日交易时间）
        now = datetime.now()
        is_weekend = now.weekday() >= 5
        if is_weekend:
            details["trading_time_check"] = False
            return False, "周末不交易", details
        
        details["trading_time_check"] = self.is_trading_time()
        # 注意：这里不直接拒绝，模拟盘信号可能在非交易时间产生
        
        # 2. 单笔订单检查
        single_pass, single_msg = self.check_single_order(signal.order)
        details["single_order_check"] = single_pass
        if not single_pass:
            return False, single_msg, details
        
        # 3. 日限额检查
        daily_pass, daily_msg = self.check_daily_limit()
        details["daily_limit_check"] = daily_pass
        if not daily_pass:
            return False, daily_msg, details
        
        # 4. 禁止列表检查
        details["forbidden_check"] = signal.order.stock_code not in self.forbidden_stocks
        
        return True, "风控通过", details
    
    def record_order(self):
        """记录下单，更新统计"""
        self.daily_order_count += 1
        self.last_order_time = datetime.now()
    
    def reset_daily(self):
        """重置日统计（每日开盘调用）"""
        self.daily_order_count = 0
        self.daily_orders_value = 0
```

#### 5.2.4 格式转换 services/format_converter.py

```python
# services/format_converter.py
"""
JoinQuant 信号 → QMT 格式转换
"""
from models.signal import Signal, Order, Direction
from typing import Dict, Any

class FormatConverter:
    """
    将统一信号格式转换为 QMT XtQuant API 所需的格式
    """
    
    @staticmethod
    def to_qmt_format(signal: Signal) -> Dict[str, Any]:
        """
        转换为 QMT下单格式
        
        QMT XtQuant API 关键参数:
        - stock_list: 股票列表
        - buy_amount: 买入数量（必须是100的整数倍，A股）
        - price_type: 下单价格类型
        """
        order = signal.order
        
        # ============ 数量处理 ============
        volume = order.volume
        # A股规则：买入数量必须是100的整数倍（整手）
        if volume % 100 != 0:
            volume = (volume // 100) * 100
            if volume == 0:
                volume = 100  # 最少1手
        
        # ============ 股票代码转换 ============
        # JoinQuant: 600519.SH -> QMT: 600519.SH（格式一致）
        stock_code = order.stock_code
        
        # ============ 方向 ============
        # JoinQuant: buy/sell -> QMT: 1/2
        direction_map = {"buy": 1, "sell": 2}
        direction = direction_map.get(order.direction.value, 1)
        
        # ============ 价格类型 ============
        # JoinQuant: market/limit -> QMT: 5/4
        price_type_map = {
            "market": 5,   # 最新价
            "limit": 4,    # 限价
        }
        price_type = price_type_map.get(order.order_type.value, 5)
        
        # ============ 构建 QMT 下单参数 ============
        qmt_order = {
            "stock_list": [stock_code],
            "buy_amount": volume if direction == 1 else 0,
            "sell_amount": volume if direction == 2 else 0,
            "price_type": price_type,
            "price": order.price if order.price > 0 else 0,
            "trade_direction": direction,
            "signal_id": signal.signal_id,
            "strategy_name": signal.strategy.name,
        }
        
        return qmt_order
    
    @staticmethod
    def validate_stock_code(code: str) -> tuple[bool, str]:
        """
        验证股票代码格式
        JoinQuant/QMT 格式: 600519.SH (上海) / 000001.SZ (深圳)
        """
        if not code or "." not in code:
            return False, "股票代码格式错误，缺少市场后缀"
        
        parts = code.split(".")
        if len(parts) != 2:
            return False, "股票代码格式错误"
        
        stock, market = parts
        valid_markets = ["SH", "SZ", "HK", "BJ"]  # 沪深港北
        if market.upper() not in valid_markets:
            return False, f"不支持的市场: {market}"
        
        return True, "通过"
```

#### 5.2.5 信号路由 routers/signal.py

```python
# routers/signal.py
from fastapi import APIRouter, HTTPException, Header, Request
from models.signal import Signal, SignalResponse
from services.risk_control import RiskController
from services.format_converter import FormatConverter
from services.logger import SignalLogger
from datetime import datetime
import uuid

router = APIRouter(prefix="/signal", tags=["信号处理"])

risk_ctrl = RiskController()
converter = FormatConverter()
logger = SignalLogger()

# ============ API Key 验证 ============
async def verify_api_key(x_api_key: str = Header(None)):
    """验证 API Key"""
    expected_key = "your-secret-api-key"  # 生产环境从环境变量读取
    if x_api_key != expected_key:
        raise HTTPException(status_code=401, detail="API Key 无效")
    return x_api_key

@router.post("/", response_model=SignalResponse)
async def receive_signal(
    signal: Signal,
    request: Request,
    api_key: str = Header(None)
):
    """
    接收 JoinQuant 信号
    """
    # 1. 验证 API Key
    if api_key != "your-secret-api-key":
        raise HTTPException(status_code=401, detail="API Key 无效")
    
    # 2. 记录日志
    logger.log_signal(signal, "received")
    
    # 3. 风控校验
    risk_pass, risk_msg, risk_details = risk_ctrl.validate(signal)
    if not risk_pass:
        logger.log_signal(signal, "rejected", {"reason": risk_msg})
        return SignalResponse(
            success=False,
            signal_id=signal.signal_id,
            message=f"风控拒绝: {risk_msg}",
            risk_check=risk_details
        )
    
    # 4. 格式转换
    qmt_format = converter.to_qmt_format(signal)
    
    # 5. 验证股票代码
    code_valid, code_msg = FormatConverter.validate_stock_code(signal.order.stock_code)
    if not code_valid:
        return SignalResponse(
            success=False,
            signal_id=signal.signal_id,
            message=f"股票代码验证失败: {code_msg}",
            risk_check=risk_details
        )
    
    # 6. 发送到 QMT（见下一节）
    # 这里先返回转换后的格式，实际下单由 QMT 端触发
    order_id = f"QMT-{datetime.now().strftime('%Y%m%d%H%M%S')}-{uuid.uuid4().hex[:6]}"
    
    # 7. 记录订单
    risk_ctrl.record_order()
    logger.log_signal(signal, "accepted", {
        "order_id": order_id,
        "qmt_format": qmt_format
    })
    
    return SignalResponse(
        success=True,
        signal_id=signal.signal_id,
        message="信号已接收并通过风控",
        risk_check=risk_details,
        order_id=order_id
    )
```

#### 5.2.6 日志服务 services/logger.py

```python
# services/logger.py
"""
信号日志服务
"""
import json
from datetime import datetime
from pathlib import Path
from models.signal import Signal
from typing import Dict, Any

class SignalLogger:
    def __init__(self, log_dir: str = "./logs"):
        self.log_dir = Path(log_dir)
        self.log_dir.mkdir(exist_ok=True)
        self.today = datetime.now().strftime("%Y%m%d")
    
    def _get_log_file(self):
        return self.log_dir / f"signals_{self.today}.jsonl"
    
    def log_signal(self, signal: Signal, status: str, extra: Dict[str, Any] = None):
        """记录信号到 JSONL 文件"""
        log_entry = {
            "timestamp": datetime.now().isoformat(),
            "signal_id": signal.signal_id,
            "source": signal.source,
            "status": status,
            "stock": signal.order.stock_code,
            "direction": signal.order.direction.value,
            "volume": signal.order.volume,
            "strategy": signal.strategy.name,
            "extra": extra or {}
        }
        
        with open(self._get_log_file(), "a", encoding="utf-8") as f:
            f.write(json.dumps(log_entry, ensure_ascii=False) + "\n")
    
    def get_daily_summary(self) -> Dict[str, Any]:
        """获取当日统计"""
        log_file = self._get_log_file()
        if not log_file.exists():
            return {"total": 0, "accepted": 0, "rejected": 0}
        
        stats = {"total": 0, "accepted": 0, "rejected": 0}
        with open(log_file, "r", encoding="utf-8") as f:
            for line in f:
                entry = json.loads(line)
                stats["total"] += 1
                if entry["status"] == "accepted":
                    stats["accepted"] += 1
                elif entry["status"] == "rejected":
                    stats["rejected"] += 1
        
        return stats
```

#### 5.2.7 状态查询路由 routers/status.py

```python
# routers/status.py
from fastapi import APIRouter
from datetime import datetime
from services.logger import SignalLogger

router = APIRouter(prefix="/status", tags=["状态查询"])
logger = SignalLogger()

@router.get("/summary")
async def get_summary():
    """获取当日信号统计"""
    return {
        "date": datetime.now().strftime("%Y-%m-%d"),
        "summary": logger.get_daily_summary()
    }

@router.get("/risk-status")
async def get_risk_status():
    """获取风控状态"""
    # 这里需要引用 risk_ctrl 实例
    from routers.signal import risk_ctrl
    return {
        "daily_order_count": risk_ctrl.daily_order_count,
        "max_daily_orders": risk_ctrl.max_daily_orders,
        "max_single_order_value": risk_ctrl.max_single_order_value,
    }
```

### 5.3 requirements.txt

```
fastapi>=0.100.0
uvicorn>=0.23.0
pydantic>=2.0.0
httpx>=0.24.0
pandas>=2.0.0
numpy>=1.24.0
python-multipart>=0.0.6
```

---

## 六、QMT 端实现

### 6.1 XtQuant 安装

```bash
# QMT 终端自带 Python 环境，安装 XtQuant
# 在 QMT Python 环境中执行
pip install xtquant
```

### 6.2 QMT 执行器 qmt/executor.py

```python
# qmt/executor.py
"""
QMT 下单执行器
使用 XtQuant API
"""
from xtquant import xtdatacenter
from xtquant import xtstock
from xtquant import xttrader
import xtquant.xttrader as xt
from datetime import datetime
import time

class QMTExecutor:
    def __init__(self, account_id: str, account_type: str = "STOCK"):
        """
        初始化 QMT 执行器
        
        Args:
            account_id: 资金账号（模拟或实盘）
            account_type: 账户类型 STOCK/CRYPTO 等
        """
        self.account_id = account_id
        self.account_type = account_type
        self.trader = None
        self.connected = False
    
    def connect(self, qmt_terminal_path: str = None):
        """
        连接 QMT 终端
        
        Args:
            qmt_terminal_path: QMT 终端路径，默认自动寻找
        """
        try:
            # 初始化交易通道
            self.trader = xt.XtQuantTrader()
            
            # 连接终端
            session = self.trader.connect()
            if session < 0:
                raise Exception(f"QMT 连接失败，session: {session}")
            
            # 绑定账号
            acc = xt.QtAccount(self.account_type, self.account_id, "")
            self.trader.subscribe(acc)
            
            self.connected = True
            print(f"✅ QMT 连接成功，账号: {self.account_id}")
            
        except Exception as e:
            print(f"❌ QMT 连接失败: {e}")
            self.connected = False
            raise
    
    def place_order(self, stock_code: str, direction: int, volume: int, 
                   price: float = 0, price_type: int = 5) -> dict:
        """
        下单
        
        Args:
            stock_code: 股票代码，如 "600519.SH"
            direction: 1=买入，2=卖出
            volume: 股数（必须是100的整数倍）
            price: 限价（price_type=4时有效）
            price_type: 5=市价，4=限价
        
        Returns:
            dict: 下单结果
        """
        if not self.connected:
            return {"success": False, "message": "QMT 未连接"}
        
        # A股规则：买入必须是100的整数倍
        if volume % 100 != 0:
            volume = (volume // 100) * 100
        
        try:
            acc = xt.QtAccount(self.account_type, self.account_id, "")
            
            # 下单
            order_id = self.trader.order_stock(
                acc,
                stock_code,
                direction,  # 1=buy, 2=sell
                volume,
                price_type,  # 5=市价
                price if price > 0 else 0
            )
            
            # 等待成交回报
            time.sleep(0.5)
            
            return {
                "success": True,
                "order_id": order_id,
                "stock": stock_code,
                "direction": "买入" if direction == 1 else "卖出",
                "volume": volume,
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            return {
                "success": False,
                "message": str(e),
                "stock": stock_code
            }
    
    def get_positions(self) -> list:
        """获取当前持仓"""
        if not self.connected:
            return []
        
        try:
            acc = xt.QtAccount(self.account_type, self.account_id, "")
            positions = self.trader.get_positions(acc)
            return positions
        except Exception as e:
            print(f"获取持仓失败: {e}")
            return []
    
    def close(self):
        """断开连接"""
        if self.connected and self.trader:
            self.trader.disconnect()
            self.connected = False
            print("QMT 连接已关闭")


# ============ 独立运行示例 ============
if __name__ == "__main__":
    # 创建执行器（使用模拟账号）
    executor = QMTExecutor(account_id="你的QMT账号")
    
    # 连接
    executor.connect()
    
    # 下单示例
    result = executor.place_order(
        stock_code="600519.SH",
        direction=1,  # 买入
        volume=100,  # 1手
        price_type=5  # 市价
    )
    print(result)
    
    # 关闭
    executor.close()
```

### 6.3 WorkBuddy 端集成 QMT 执行

在 `routers/signal.py` 中，当信号通过风控后，调用 QMT 执行：

```python
# 在 receive_signal 函数中，替换第6步

# 6. 发送到 QMT
from qmt.executor import QMTExecutor

qmt_executor = QMTExecutor(
    account_id="你的QMT账号",  # 生产环境从配置读取
    account_type="STOCK"
)

# 获取转换后的格式
qmt_format = converter.to_qmt_format(signal)

# 执行下单
order_result = qmt_executor.place_order(
    stock_code=qmt_format["stock_list"][0],
    direction=qmt_format["trade_direction"],
    volume=qmt_format["buy_amount"] or qmt_format["sell_amount"],
    price=qmt_format["price"],
    price_type=qmt_format["price_type"]
)

if order_result["success"]:
    logger.log_signal(signal, "executed", order_result)
else:
    logger.log_signal(signal, "execution_failed", order_result)
```

---

## 七、部署流程

### 7.1 部署顺序

```
第一步：部署 QMT 端
├── 安装 QMT 终端（券商提供）
├── 安装 XtQuant Python 包
├── 配置交易账号（模拟盘测试）
└── 验证下单功能

第二步：部署 WorkBuddy 中转服务
├── 准备服务器（云服务器或本地 + 内网穿透）
├── 安装 Python 3.9+
├── 部署代码（git clone）
├── 安装依赖
├── 配置 .env（API Key、QMT账号等）
└── 启动服务（后台运行）

第三步：配置 JoinQuant 端
├── 编写策略代码
├── 开启模拟盘
├── 配置 webhook 回调地址（WorkBuddy 地址）
└── 观察信号推送日志

第四步：全链路测试
├── JoinQuant 模拟盘触发信号
├── 检查 WorkBuddy 日志
├── 检查 QMT 订单
└── 验证完整流程
```

### 7.2 启动脚本

```bash
# start_workbuddy_service.sh
#!/bin/bash

export PORT=8000
export API_KEY="your-secret-api-key"
export QMT_ACCOUNT_ID="你的QMT账号"

cd /path/to/workbuddy-trading
nohup python main.py > app.log 2>&1 &

echo "WorkBuddy 服务已启动，PID: $!"
echo "日志文件: app.log"
```

---

## 八、安全与运维

### 8.1 安全措施

| 项目 | 措施 |
|------|------|
| API Key | 每次请求验证，存储在环境变量 |
| HTTPS | 生产环境启用 HTTPS（nginx 反向代理） |
| IP 白名单 | 只允许 JoinQuant IP 段访问回调接口 |
| 日志脱敏 | 日志中隐藏资金账号等敏感信息 |
| 异常告警 | 信号处理失败时发送通知（可选） |

### 8.2 监控指标

| 指标 | 说明 |
|------|------|
| 信号接收量 | 每分钟/每小时收到的信号数 |
| 风控通过率 | 通过/拒绝比例 |
| 下单成功率 | QMT 下单成功/失败 |
| 延迟 | 信号产生到下单完成的耗时 |
| 日志文件大小 | 防止磁盘占满 |

### 8.3 常见问题

| 问题 | 排查方向 |
|------|---------|
| 信号未收到 | 检查网络、防火墙、日志 |
| 风控误拒 | 检查风控规则是否过严 |
| QMT 下单失败 | 检查账号状态、资金、持仓限制 |
| 内网穿透失效 | 检查 ngrok/frp 服务状态 |

---

## 九、进阶扩展

### 9.1 可选功能

- [ ] **Web 管理界面**：查看信号日志、风控状态、手动干预
- [ ] **多策略支持**：区分不同策略来源
- [ ] **仓位同步**：从 QMT 同步持仓到 WorkBuddy 做风控
- [ ] **消息通知**：钉钉/飞书推送下单结果
- [ ] **回测对接**：与 JoinQuant 回测结果对比

### 9.2 高可用方案

```
                    ┌─────────────┐
                    │   聚宽      │
                    └──────┬──────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
         HTTP POST    HTTP POST    HTTP POST
              │            │            │
    ┌─────────┴──┐ ┌──────┴─────┐ ┌──────┴──────┐
    │  WorkBuddy  │ │  WorkBuddy │ │  WorkBuddy  │
    │   主节点     │ │   备节点1   │ │   备节点2   │
    └──────┬──────┘ └──────┬─────┘ └──────┬──────┘
           │               │              │
           └───────────────┼──────────────┘
                           │
                    ┌──────┴──────┐
                    │     QMT     │
                    │   （唯一）   │
                    └─────────────┘
```

---

## 十、快速验证清单

```
□ QMT 终端已安装，账号可登录
□ XtQuant Python 包已安装
□ QMT 执行器单独测试通过（能下单）

□ WorkBuddy 服务已启动
□ /health 接口返回 healthy
□ /signal 接口可接收 POST 请求
□ 风控校验正常工作

□ JoinQuant 策略已编写
□ 模拟盘 webhook 配置正确
□ 首次信号成功到达 WorkBuddy

□ 完整链路验证：信号 → 风控 → QMT 下单
□ 检查 QMT 终端订单记录
□ 检查 WorkBuddy 日志文件
```

---

*文档版本：v1.0 | 编写日期：2026-04-26*
