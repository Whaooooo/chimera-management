<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  createInventory,
  getAllInventories,
  updateInventory,
  inbound as apiInboundInventory,
  checkInventory as apiCheckInventory,
  getInventoryRecordsByTimePeriod // 确保已在 services.gen 中定义
} from '../client/services.gen'; // 确保包含 getInventoryRecordsByTimePeriod
import type { Inventory, InboundRequest, CheckInventoryRequest, TimePeriodRequest } from '../client/types.gen';
import {
  ElMessage,
  ElTable,
  ElTableColumn,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElInputNumber,
  ElSelect,
  ElOption,
  ElPagination,
  ElDatePicker
} from 'element-plus';
import * as XLSX from 'xlsx'; // 保留 XLSX 导入

// 数据引用
const inventories = ref<Inventory[]>([]);
const isDeleteDialogVisible = ref(false);
const isEditDialogVisible = ref(false);
const isInboundDialogVisible = ref(false);
const isCheckDialogVisible = ref(false);
const isExportDialogVisible = ref(false); // 新增
const isDeleting = ref(false);
const isSaving = ref(false);
const isInbounding = ref(false);
const isChecking = ref(false);
const isExporting = ref(false); // 新增
const inventoryToDelete = ref<Inventory | null>(null);
const editableInventory = ref<Inventory | null>(null);

// 导出记录相关
const exportStartDate = ref<string>(''); // 开始日期
const exportEndDate = ref<string>('');   // 结束日期

// 移除 operator 字段，并调整 inboundData 和 checkData 的结构
const inboundData = ref<{ body: InboundRequest }>({
  body: {
    inventoryId: '',
    amount: 1
  }
});

const checkData = ref<{ body: CheckInventoryRequest }>({
  body: {
    inventoryId: '',
    checkedAmount: 0
  }
});

// 分页相关
const currentPage = ref(1);
const pageSize = ref(10);

// 搜索相关
const searchQuery = ref({
  name: '',
  type: ''
});

// 统计所有类型
const allTypes = ref<string[]>([]);

// 重置筛选条件
const resetFilters = () => {
  searchQuery.value = { name: '', type: '' };
  currentPage.value = 1;
};

// 过滤后的库存列表
const filteredInventories = computed(() => {
  return inventories.value.filter(inventory => {
    const matchesName = searchQuery.value.name === '' || inventory.name.includes(searchQuery.value.name);
    const matchesType = searchQuery.value.type === '' || inventory.type === searchQuery.value.type;
    // 仅显示未删除的物品
    const notDeleted = !inventory.deleted;
    return matchesName && matchesType && notDeleted;
  });
});

// 分页后的库存列表
const paginatedInventories = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredInventories.value.slice(start, end);
});

// 获取所有库存物品
const fetchInventories = async () => {
  try {
    const response = await getAllInventories();
    inventories.value = response.data as unknown as Inventory[];
    // 统计所有唯一的类型
    const typesSet = new Set<string>();
    inventories.value.forEach(item => {
      if (item.type) {
        typesSet.add(item.type);
      }
    });
    allTypes.value = Array.from(typesSet);
    console.log('inventories:', inventories.value);
  } catch (error) {
    console.error('获取库存物品失败:', error);
    ElMessage.error('获取库存物品失败');
  }
};

// 打开创建对话框
const openCreateDialog = () => {
  editableInventory.value = {
    name: '',
    type: '',
    unit: '',
    remain: 0,
    // 确保 'deleted' 字段存在并为 false
    deleted: false,
  };
  isEditDialogVisible.value = true;
};

// 打开编辑对话框
const openEditDialog = (inventory: Inventory) => {
  editableInventory.value = { ...inventory };
  isEditDialogVisible.value = true;
};

// 保存创建或编辑的库存物品
const saveInventoryChanges = async () => {
  if (!editableInventory.value) return;

  isSaving.value = true;

  try {
    if (editableInventory.value.id) {
      // 编辑操作，使用新的 updateInventory 定义
      await updateInventory({
        body: editableInventory.value,
        query: { id: editableInventory.value.id!.toString() },
        method: 'PUT',
        throwOnError: true
      });
      ElMessage.success('物品更新成功');
    } else {
      // 创建操作
      await createInventory({
        body: editableInventory.value
      });
      ElMessage.success('物品创建成功');
    }

    await fetchInventories();
    isEditDialogVisible.value = false;
  } catch (error: any) {
    console.error('保存物品失败:', error);
    ElMessage.error('保存物品失败: ' + (error.message || '未知错误'));
  } finally {
    isSaving.value = false;
  }
};

// 打开删除确认对话框
const confirmDelete = (inventory: Inventory) => {
  inventoryToDelete.value = inventory;
  isDeleteDialogVisible.value = true;
};

// 删除库存物品（通过设置 deleted 为 true）
const deleteInventory = async () => {
  if (!inventoryToDelete.value) return;

  isDeleting.value = true;
  try {
    // 使用 updateInventory 来标记为删除
    await updateInventory({
      body: { ...inventoryToDelete.value, deleted: true },
      query: { id: inventoryToDelete.value.id!.toString() },
      method: 'PUT',
      throwOnError: true
    });
    ElMessage.success('物品删除成功');
    await fetchInventories();
    isDeleteDialogVisible.value = false;
  } catch (error: any) {
    console.error('删除物品失败:', error);
    ElMessage.error('删除物品失败: ' + (error.message || '未知错误'));
  } finally {
    isDeleting.value = false;
  }
};

// 打开入库对话框
const openInboundDialog = (inventory: Inventory) => {
  inboundData.value = {
    body: {
      inventoryId: inventory.id!.toString(),
      amount: 1
    }
  };
  isInboundDialogVisible.value = true;
};

// 入库操作
const inboundInventory = async () => {
  isInbounding.value = true;
  try {
    await apiInboundInventory(inboundData.value);
    ElMessage.success('入库成功');
    await fetchInventories();
    isInboundDialogVisible.value = false;
  } catch (error: any) {
    console.error('入库失败:', error);
    ElMessage.error('入库失败: ' + (error.message || '未知错误'));
  } finally {
    isInbounding.value = false;
  }
};

// 打开清查对话框
const openCheckDialog = (inventory: Inventory) => {
  checkData.value = {
    body: {
      inventoryId: inventory.id!.toString(),
      checkedAmount: inventory.remain
    }
  };
  isCheckDialogVisible.value = true;
};

// 清查操作
const checkInventory = async () => {
  isChecking.value = true;
  try {
    await apiCheckInventory(checkData.value);
    ElMessage.success('清查成功');
    await fetchInventories();
    isCheckDialogVisible.value = false;
  } catch (error: any) {
    console.error('清查失败:', error);
    ElMessage.error('清查失败: ' + (error.message || '未知错误'));
  } finally {
    isChecking.value = false;
  }
};

// 辅助函数：格式化日期
const formatDate = (date: Date, format: string): string => {
  const map: Record<string, string> = {
    yyyy: date.getFullYear().toString(),
    MM: (`0${date.getMonth() + 1}`).slice(-2),
    dd: (`0${date.getDate()}`).slice(-2),
    HH: (`0${date.getHours()}`).slice(-2),
    mm: (`0${date.getMinutes()}`).slice(-2),
    ss: (`0${date.getSeconds()}`).slice(-2),
  };

  return format.replace(/yyyy|MM|dd|HH|mm|ss/g, matched => map[matched]);
};

// 辅助函数：设置日期为当天的最后一秒
const setEndOfDay = (date: Date): Date => {
  date.setHours(23, 59, 59, 999);
  return date;
};

// 打开导出记录对话框
const openExportDialog = () => {
  exportStartDate.value = '';
  exportEndDate.value = '';
  isExportDialogVisible.value = true;
};

// 辅助函数：生成日期列表
const generateDateList = (start: Date, end: Date): string[] => {
  const dateList: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dateList.push(formatDate(new Date(current), 'yyyy-MM-dd'));
    current.setDate(current.getDate() + 1);
  }
  return dateList;
};

// 导出记录操作
const exportRecords = async () => {
  if (!exportStartDate.value || !exportEndDate.value) {
    ElMessage.error('请选择开始和结束时间');
    return;
  }

  // 创建 Date 对象
  const startDate = new Date(exportStartDate.value);
  const endDate = setEndOfDay(new Date(exportEndDate.value));

  // 验证日期范围
  if (startDate > endDate) {
    ElMessage.error('开始日期不能晚于结束日期');
    return;
  }

  isExporting.value = true;

  const requestPayload: TimePeriodRequest = {
    startTime: startDate.toISOString(), // 转换为 ISO 字符串
    endTime: endDate.toISOString()      // 转换为 ISO 字符串
  };

  try {
    // 调用后端 API
    const response = await getInventoryRecordsByTimePeriod({
      body: requestPayload
    });

    // 根据后端返回的数据结构调整类型
    const data = response.data as Record<string, { inbound: number[]; check: number[] }>;

    console.log('data: ', data);

    // 生成日期列表
    const dateList = generateDateList(startDate, endDate);
    const totalColumn = 'Total';
    const header = ['Name', ...dateList, totalColumn];

    // 初始化 Excel 数据数组
    const excelData: any[] = [header];

    // 遍历每个库存项
    for (const [inventoryName, records] of Object.entries(data)) {
      const { inbound, check } = records;

      // 确保 inbound 和 check 列表长度正确
      if (inbound.length !== dateList.length + 1 || check.length !== dateList.length + 1) {
        console.warn(`库存项 ${inventoryName} 的数据长度不符合预期`);
        continue;
      }

      // 创建入库行
      const inboundRow = [
        `${inventoryName} - 入库`,
        ...inbound.slice(0, dateList.length),
        inbound[inbound.length - 1] // 总和
      ];

      // 创建查清行
      const checkRow = [
        `${inventoryName} - 清算出库`,
        ...check.slice(0, dateList.length),
        check[check.length - 1] // 总和
      ];

      // 添加到 Excel 数据中
      excelData.push(inboundRow, checkRow);
    }

    console.log('excelData:', excelData);

    // 创建工作表
    const worksheet = XLSX.utils.aoa_to_sheet(excelData);

    // 创建工作簿并添加工作表
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Records');

    // 获取当前日期和时间，用于文件命名
    const formattedStartDate = formatDate(startDate, 'yyyyMMdd_HHmmss');
    const formattedEndDate = formatDate(endDate, 'yyyyMMdd_HHmmss');

    // 生成文件名
    const fileName = `出入库记录_${formattedStartDate}_to_${formattedEndDate}.xlsx`;

    // 导出 Excel 文件
    XLSX.writeFile(workbook, fileName);

    ElMessage.success('记录已成功导出');
    isExportDialogVisible.value = false;
  } catch (error: any) {
    console.error('导出记录失败:', error);
    ElMessage.error('导出记录失败: ' + (error.message || '未知错误'));
  } finally {
    isExporting.value = false;
  }
};

// 生命周期钩子
onMounted(async () => {
  await fetchInventories();
});
</script>


<template>
  <div>
    <!-- 顶部工具栏 -->
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
      <h3>搜索</h3>
      <el-button type="primary" @click="openExportDialog">导出记录</el-button> <!-- 新增按钮 -->
    </div>

    <el-form inline>
      <el-form-item label="名称">
        <el-input v-model="searchQuery.name" placeholder="输入物品名称"></el-input>
      </el-form-item>

      <el-form-item label="类型">
        <el-select v-model="searchQuery.type" placeholder="选择类型" style="width: 200px;" clearable>
          <el-option
            v-for="type in allTypes"
            :key="type"
            :label="type"
            :value="type"
          ></el-option>
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button @click="resetFilters">重置</el-button>
      </el-form-item>
    </el-form>

    <el-button type="primary" @click="openCreateDialog" style="margin: 20px 0;">创建物品</el-button>

    <h1>库存列表</h1>

    <el-table :data="paginatedInventories" stripe>
      <el-table-column label="名称" width="180px">
        <template #default="{ row }">
          <div>
            <div style="font-weight: bold;">{{ row.name }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="类型" width="180px">
        <template #default="{ row }">
          <div>
            <div>{{ row.type }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="剩余量">
        <template #default="{ row }">
          <div>
            <div>{{ row.remain }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="计量单位">
        <template #default="{ row }">
          <div>
            <div>{{ row.unit }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="操作" width="500px">
        <template #default="{ row }">
          <el-button type="primary" @click="openEditDialog(row)">编辑</el-button>
          <el-button type="danger" @click="confirmDelete(row)">删除</el-button>
          <el-button type="success" @click="openInboundDialog(row)">入库</el-button>
          <el-button type="warning" @click="openCheckDialog(row)">清查</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 分页组件 -->
    <el-pagination
      v-model:current-page="currentPage"
      :page-size="pageSize"
      :total="filteredInventories.length"
      layout="prev, pager, next"
    />

    <!-- Delete Confirmation Dialog -->
    <el-dialog v-model="isDeleteDialogVisible" width="30%" title="确认删除">
      <span>是否确认删除该物品？</span>
      <template #footer>
        <el-button type="primary" @click="deleteInventory" :loading="isDeleting">是</el-button>
        <el-button @click="isDeleteDialogVisible = false">否</el-button>
      </template>
    </el-dialog>

    <!-- Create/Edit Inventory Dialog -->
    <el-dialog v-model="isEditDialogVisible" width="50%" :title="editableInventory?.id ? '编辑物品' : '创建物品'">
      <el-form v-if="editableInventory" :model="editableInventory">
        <el-form-item label="名称">
          <el-input v-model="editableInventory.name"></el-input>
        </el-form-item>
        <el-form-item label="类型">
          <el-select v-model="editableInventory.type" placeholder="选择或输入类型" clearable>
            <el-option
              v-for="type in allTypes"
              :key="type"
              :label="type"
              :value="type"
            ></el-option>
            <el-option
              label="添加新类型"
              :value="editableInventory.type"
              v-if="!allTypes.includes(editableInventory.type)"
            ></el-option>
          </el-select>
          <el-input
            v-if="!allTypes.includes(editableInventory.type)"
            v-model="editableInventory.type"
            placeholder="输入新类型"
            style="margin-top: 5px;"
          ></el-input>
        </el-form-item>
        <el-form-item label="计量单位">
          <el-input v-model="editableInventory.unit"></el-input>
        </el-form-item>
        <!-- 仅在创建模式下显示“剩余量”字段 -->
        <el-form-item v-if="!editableInventory.id" label="剩余量">
          <el-input-number v-model.number="editableInventory.remain" :min="0" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button type="primary" @click="saveInventoryChanges" :loading="isSaving">保存</el-button>
        <el-button @click="isEditDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>

    <!-- Inbound Dialog -->
    <el-dialog v-model="isInboundDialogVisible" width="30%" title="入库操作">
      <el-form :model="inboundData.body">
        <el-form-item label="入库数量">
          <el-input-number v-model.number="inboundData.body.amount" :min="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="inboundInventory" :loading="isInbounding">确认</el-button>
        <el-button @click="isInboundDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>

    <!-- Check Dialog -->
    <el-dialog v-model="isCheckDialogVisible" width="30%" title="清查操作">
      <el-form :model="checkData.body">
        <el-form-item label="清查后的剩余量">
          <el-input-number v-model.number="checkData.body.checkedAmount" :min="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="checkInventory" :loading="isChecking">确认</el-button>
        <el-button @click="isCheckDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>

    <!-- Export Records Dialog -->
    <el-dialog v-model="isExportDialogVisible" width="30%" title="导出记录">
      <el-form>
        <el-form-item label="开始时间" required>
          <el-date-picker
            v-model="exportStartDate"
            type="date"
            placeholder="选择开始日期"
            style="width: 100%;"
          ></el-date-picker>
        </el-form-item>
        <el-form-item label="结束时间" required>
          <el-date-picker
            v-model="exportEndDate"
            type="date"
            placeholder="选择结束日期"
            style="width: 100%;"
          ></el-date-picker>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="exportRecords" :loading="isExporting">确认</el-button>
        <el-button @click="isExportDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>


<style scoped>
.option-item {
  display: block;
  width: 100%;
}

::v-deep .el-select__tags {
  display: flex;
  flex-wrap: wrap;
}

::v-deep .el-tag {
  min-width: 120px;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

::v-deep .el-tag__close {
  margin-left: 5px;
}
</style>

