# Sim-FAST-PY 到底仿真了什么物理量

2026-09-12。读自源码（`Elements_*.py` / `Solver_*.py` / `Assembly_ThickOrigami.py`），不是读 README。

**仓库**：https://github.com/zzhuyii/Sim-FAST-PY （Python）
**MATLAB 原版**：https://github.com/zzhuyii/Sim-FAST
**作者**：Yi Zhu (zzhuyii) —— **SWOMPS 的作者**，Filipov 的博士生
**许可**：CC-BY 4.0
**在线 demo**（不用装环境就能玩）：https://deployablebridges.streamlit.app/

## ⚠️ 更正之前的笔记

之前写「L2 力学层只有 MATLAB（MERLIN2 / SWOMPS）」—— **不成立了。整条管线可以纯 Python。**

血统：Resch & Cristiansen (1970) → Liu & Paulino bar-and-hinge (2017) → Zhu。README 里他自己列了这条谱系。

README 原话（他做 Python 版的动机就是我要干的事）：
> *"python package enables better integration with **other AI methods and optimization methods**"*
> *"Being non-black-box also make it easy to ... **connect the code with optimization packages for design**"*

---

## 自由度：只有节点 XYZ，没有转动自由度

`Elements_Nodes` 全文只有四个字段：

```python
self.coordinates_mat        # (N,3) 节点坐标
self.mass_vec               # (N,)  节点集中质量（动力学用）
self.current_U_mat          # (N,3) 位移场
self.current_ext_force_mat  # (N,3) 外力
```

弯曲/扭转**不靠转动自由度**，靠**四节点/三节点转动弹簧单元**实现。
同源于 Larry Howell 的 pseudo-rigid-body model 和结构动力学的集中质量法。

---

## 物理参数（按单元类型）

### ① Bar 杆单元 `Elements_Vec_Bars`
```python
self.A_vec   # 截面积
self.E_vec   # 杨氏模量
self.L0_vec  # 无应力长度
```
Green-Lagrange 型应变：`Ex = (1/L²)·dX·(u₂-u₁) + (1/2L²)·|u₂-u₁|²`
→ **几何非线性 + 线弹性**。力和刚度是势能的精确梯度/Hessian。

### ② 4N 转动弹簧 `Elements_Vec_RotSprings_4N` = **折痕**
```python
self.rot_spr_K_vec           # 折痕扭转刚度 κ  ← 就是要实验标定的那个量
self.theta_stress_free_vec   # 无应力折角 —— 折痕的「记忆」/预折角
self.theta_current_vec       # 当前折角
self.theta1, self.theta2     # 防穿透刚化阈值
```
文件头注明 `Reference: Liu and Paulino, RSPA`。

**`theta_stress_free` 很重要**：能建模「这条折痕被折过了，它记得自己该弯多少」。
纸的塑性记忆只能靠这个参数间接进来。

### ③ CST 三角形膜单元 `Elements_Vec_CST` = **面板**
```python
self.t_vec   # 厚度  ← 厚度在这里
self.E_vec   # 杨氏模量
self.v_vec   # 泊松比
self.A_vec   # 参考面积
self.L_mat   # 参考边长 [L1,L2,L3]
```

### ④ Zero-length spring `Elements_Vec_Zero_L_Spring`
把厚板缝合在一起的连接件。

---

## 载荷与边界条件

`Solver_NR_Loading`（载荷控制 Newton-Raphson）：
```python
self.supp       # (n,4) = [node, fx, fy, fz]  支承/约束
self.load       # (n,4) = [node, Fx, Fy, Fz]  外载荷
self.increStep  # 50 —— 载荷线性分步加载
self.tol        # 1e-5
self.iterMax    # 30
self.Uhis       # (increStep, N, 3) —— 全过程位移历史，不只终态
```

`Solver_DC`（位移控制）多两个字段：`lambdaBar`、`selectedRefDisp`
→ **用来追踪屈曲和 snap-through（多稳态）**。承重结构的失效点靠它抓。

---

## 厚板折纸怎么建

`Assembly_ThickOrigami.Add_Triangle_Panel(n1..n6, E, t, v)`：

> **6 个节点（下三角 3 + 上三角 3）→ 展开成 8 个 CST 三角形**
> （上下两面 + 三个侧面各 2 个）

一块厚板 = 一个有体积的三角棱柱，参数 `E` / `t` / `v`。
**这就是三维化之后要生成的目标数据结构。文件只有 3.3KB，先完整读它。**

---

## 物理维度总表

| 类别 | 有什么 |
| --- | --- |
| 几何 | 节点 XYZ、杆长、三角形面积/边长、**板厚 t** |
| 材料 | **杨氏模量 E**、**泊松比 ν**、**折痕扭转刚度 κ** |
| 状态 | 位移、应变、**应变能**、折角 θ |
| 预应力 | **无应力折角 θ₀**（折痕塑性记忆） |
| 载荷 | 节点外力 Fx/Fy/Fz、支承约束、50 步加载历史 |
| 惯性 | 节点集中质量（动力学） |
| 接触 | 仅折痕处 θ₁/θ₂ 防穿透刚化 |

## 没有的东西

| 缺失 | 能不能补 |
| --- | --- |
| **重力** | ✅ 容易。`m·g` 写成节点力加进 `load` 表 |
| **风载** | ✅ 可以但要自己做。风压按面积离散成节点力加进 `load`。工程标准做法，不需要 CFD |
| **塑性** | ❌ 全线弹性。折痕塑性只能靠 `theta_stress_free` 间接表达 |
| **通用接触 / 自碰撞** | ❌ 只有折痕处局部防穿透，**面板之间没有通用接触** |
| **摩擦** | ❌ 完全没有 |
| **温湿度** | ❌ 纸对湿度极敏感，完全没有 |
| **蠕变 / 折痕松弛** | ❌ 无时间相关行为 |

---

# ★ 开放问题：层序如何传进力学模型

**这是我核心假设的生死问题，必须先想清楚再动手。**

我的假设是「不同 state（层叠顺序不同）力学性能不同」。
但 Sim-FAST 的模型里：

> **层与层之间除非显式加 zero-length spring 连接，否则互不相干。**
> 两片纸叠在一起，模型里就是两片各自独立的板。

**所以「层序」这个信息，可能根本传不进力学模型。**

不是说假设错了，而是：**层序要通过什么机制影响力学，是我必须自己回答的建模问题。**

可能的路径：

1. **层序决定几何** —— 哪层在上，决定了它在厚度方向被推到哪个位置
   → 这个 Ku 的 Thick Folding 会给出（facet-separated folded state）
   → **最可能成立的一条**

2. **层序决定哪些面之间需要加连接/接触弹簧**
   → 要自己定义规则：相邻层之间加 zero-length spring？加接触约束？
   → 加不加、加多硬，直接决定了方差大小 —— **有调参嫌疑，要小心**

3. **层序决定摩擦互锁** —— 但 Sim-FAST 没有摩擦，这条走不通，除非自己加

**→ 这正是该问 Yi Zhu 的问题。** 他做过 SWOMPS 的多物理场，会知道层间耦合该怎么建。
而且这是他专业范围内的真实技术问题，比泛泛的「我在用你的包」强得多。

---

## 怎么跑

依赖只有 `numpy` / `scipy` / `matplotlib`。没有 requirements.txt，**扁平模块布局，必须在仓库根目录跑**。

```bash
git clone https://github.com/zzhuyii/Sim-FAST-PY.git
cd Sim-FAST-PY && python3 -m venv venv && source venv/bin/activate
pip install numpy scipy matplotlib
python3 Example_Kresling.py          # 最简单的折纸算例，位移控制
python3 Example_Kirigami_Truss_Bridge.py   # 桥 —— 最接近「能承多重」
```

仓库自带 `.gif` 结果图，**跑完直接跟 GIF 对照，确认装对了没有**。

教程视频（MATLAB 版，公式体系一样）：
https://www.youtube.com/playlist?list=PLLR0SJ1WSb92-_e7nog4T6sGMNHzgWRNx

## 建议顺序

1. 跑通 `Example_Kresling.py`，对照 GIF
2. 读 `Assembly_ThickOrigami.py`（3.3KB），搞清输入格式
3. 跑 `Example_Kirigami_Truss_Bridge.py`，看承重怎么算
4. **想清楚上面那个「层序如何传进力学」的开放问题**
5. 再写 FOLD → Sim-FAST-PY 的转换器
