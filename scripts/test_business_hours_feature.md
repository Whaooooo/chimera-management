# 多段营业时间功能测试指南

## 功能说明
支持配置多段营业时间，例如：
- 单段：`08:00-22:00`
- 多段：`07:30-11:30,12:30-16:30,20:30-22:30`

## 测试步骤

### 1. 后端测试

#### 编译检查
```bash
cd /mnt/catlan/M/chimera/ChimeraCoffee
mvn clean compile -q
```

#### 运行单元测试
```bash
mvn test -Dtest=BusinessHoursValidatorTest
```

#### API 测试 (使用 curl)

1. **获取营业时间（原有接口）**
```bash
curl -X GET "https://your-api-domain/appConfiguration/openingTime"
```

2. **获取结构化营业时间（新接口）**
```bash
curl -X GET "https://your-api-domain/appConfiguration/openingTime/structured"
```

预期响应：
```json
{
  "rawValue": "07:30-11:30,12:30-16:30,20:30-22:30",
  "segments": [
    {"start": "07:30", "end": "11:30"},
    {"start": "12:30", "end": "16:30"},
    {"start": "20:30", "end": "22:30"}
  ]
}
```

3. **更新营业时间配置（带验证）**
```bash
curl -X PUT "https://your-api-domain/appConfiguration" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "id": "config_id_here",
    "key": "weekdays_opening_hours",
    "value": "07:30-11:30,12:30-16:30,20:30-22:30",
    "description": "工作日营业时间",
    "category": "business"
  }'
```

4. **验证错误处理（时间段重叠）**
```bash
curl -X PUT "https://your-api-domain/appConfiguration" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "id": "config_id_here",
    "key": "weekdays_opening_hours",
    "value": "08:00-12:00,10:00-14:00",
    "description": "工作日营业时间",
    "category": "business"
  }'
```

预期响应：
```json
{"error": "时间段不能重叠：08:00-12:00 与 10:00-14:00"}
```

### 2. 前端测试

#### 启动开发服务器
```bash
cd /mnt/catlan/M/chimera/chimera-management
npm run dev
```

#### 测试步骤

1. **访问配置页面**
   - 打开浏览器访问 `http://localhost:5173/appConfigurationShop`

2. **新增营业时间配置**
   - 点击"新增配置"
   - 键名输入 `weekdays_opening_hours`
   - 观察到自动切换为营业时间编辑器
   - 点击"+ 添加时间段"添加多个时间段
   - 设置时间如：07:30-11:30, 12:30-16:30, 20:30-22:30
   - 检查预览显示是否正确
   - 保存

3. **验证错误提示**
   - 尝试添加重叠的时间段（如 08:00-12:00 和 10:00-14:00）
   - 检查是否显示错误提示
   - 确认保存按钮被禁用

4. **编辑现有配置**
   - 找到已存在的 `weekend_opening_hours` 配置
   - 点击编辑
   - 修改时间段
   - 保存并验证

5. **验证显示格式**
   - 列表中营业时间应显示为 `07:30-11:30 | 12:30-16:30 | 20:30-22:30`
   - 背景色和字体应该与常规配置不同

### 3. 小程序测试

由于小程序未做修改，需验证：
1. 原有接口 `/appConfiguration/openingTime` 返回格式兼容
2. 返回 `07:30-11:30,12:30-16:30,20:30-22:30` 时小程序能正确显示

## 数据库配置示例

直接在 MongoDB 中设置：

```javascript
// 工作日营业时间
db.appConfigurations.updateOne(
  { key: "weekdays_opening_hours" },
  { 
    $set: { 
      key: "weekdays_opening_hours",
      value: "07:30-11:30,12:30-16:30,20:30-22:30",
      description: "工作日营业时间",
      category: "business"
    }
  },
  { upsert: true }
);

// 周末营业时间
db.appConfigurations.updateOne(
  { key: "weekend_opening_hours" },
  { 
    $set: { 
      key: "weekend_opening_hours",
      value: "09:00-12:00,14:00-18:00",
      description: "周末营业时间",
      category: "business"
    }
  },
  { upsert: true }
);
```

## 验证清单

- [ ] 后端编译成功
- [ ] 单元测试通过
- [ ] 新增营业时间配置成功
- [ ] 编辑营业时间配置成功
- [ ] 重叠时间段验证正确
- [ ] 开始时间晚于结束时间的验证正确
- [ ] 结构化API返回正确
- [ ] 前端界面显示正常
- [ ] 前端时间段编辑器工作正常
- [ ] 错误提示清晰明确
