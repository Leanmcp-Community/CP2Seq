# Flat-Folder 的导出格式，以及「三维化」这一步

2026-09-11。核实自 `src/io.js` 第 7–27 行（不是猜的，是读源码）。

---

## 导出到底给了什么

Flat-Folder 的 Export 按钮有四个链接：`cp` / `state` / `img` / `log`。
`cp` 和 `state` 都是 FOLD 格式，**是同一个对象换了两个字段**：

```js
// cp 导出
vertices_coords: V,        // 折痕图坐标（展开的平面）

// state 导出：同一份 FOLD，只改两处
FOLD.vertices_coords = Vf;      // ← 折叠后的坐标
FOLD.faceOrders      = FO;      // ← 面的堆叠顺序
```

**关键：这是平折（flat folding），`Vf` 是平面坐标。所有面躺在同一个平面里。**

所以 state 文件 = **一叠压平的纸 + 谁压谁的顺序表**：

- 几何：**平的**，没有 z 方向
- `faceOrders`：一串 `[f, g, s]` 三元组，面 f 在面 g 上面还是下面

### ⚠️ 更正
> 之前以为「Flat-Folder 已经输出 3D 了，三维化不用做」——**错的**。
> 导出的 state 不是 3D 模型。Flat-Folder 帮我省掉的是**枚举和层序求解**，不是三维化。

---

## 所以三维化是必需的一步，而且是我的核心工程贡献

```
folded state (.fold：平面坐标 Vf + faceOrders)
      │
      ▼  ★ 给每一层赋予真实厚度 t，按 faceOrders 在 z 方向展开
      │     这一步没人替我做
      ▼
真实 3D 模型（有厚度、有层间接触）
      │
      ▼  bar-and-hinge (MERLIN2 / SWOMPS)
   刚度、承载
```

**不是简单加个厚度**：纸一旦有厚度，折痕处几何就会打架 —— 这正是**厚板折纸（thick-panel origami）**要单独研究的原因。
这是整条管线里真正有技术含量的地方。

---

## 实验的正确表述（我自己的修正）

**不是**把 state 拉进物理模拟器。
**是**把「具有不同 state 的最终模型」拉进物理模拟器去对比。

state 是个组合对象（一张顺序表），不能直接进力学求解器。
必须先物化成有厚度、有材料的实体模型，**被比较的对象是这些实体模型**。

---

## 怎么查看 .fold 文件

| 方式 | 用途 | 链接 |
| --- | --- | --- |
| **FOLD 官方 viewer/validator** | 网页上传就能看，还能校验格式合法性 | https://edemaine.github.io/fold/ |
| **Rabbit Ear**（Robby Kraft） | FOLD 显示 + SVG 导入导出 + 平折计算 | https://rabbitear.org/ · https://github.com/rabbit-ear/rabbit-ear |
| Flat-Folder 自己 | 导出的文件再导入回去，看 x-ray 视图和层序渲染 | https://origamimagiro.github.io/flat-folder/ |
| Origami Simulator | 适合看 **CP** 的连续折叠动画；对 state 文件意义不大（几何是平的，没得播） | https://origamisimulator.org/ |
| **文本编辑器** | 它就是 JSON | 任何编辑器 |
| Blender 插件 | 从 FOLD 折叠，做渲染图 | https://github.com/LucR31/Origami_blender |

**看 state 文件用文本编辑器最有用。**
几何是平的，图形界面给不了多少信息；**state 之间的全部差异都在 `faceOrders` 数组里**。
想知道两个 state 差在哪 → 导出两份，`diff` 它们的 `faceOrders`。

---

## 其它从源码里读到的

- `src/` 下有 `batch.js`（6362 字节）—— 说明 `batch.html` 背后有真实实现，值得读，是脚本化枚举 state 的入口
- 其它相关文件：`solver.js`、`constraints.js`、`conversion.js`（34KB，最大，格式转换都在这）、`NOTATION.txt`（5.7KB，术语定义，应该先读这个）
- UI 里逐个挑 state 是**手动点** Component 下拉菜单 + 每个分量一个数字输入框
  → 要批量枚举几百个 state 喂进 MERLIN2，**必须脚本化**，这就是要问 Ku `batch.html` 的原因
