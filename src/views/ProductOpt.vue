<template>
  <div>
    <el-button type="primary" @click="openCreateDialog">新建商品选项</el-button>

    <h1>商品选项列表</h1>

    <el-table :data="options" stripe>
      <el-table-column prop="name" label="选项名称"></el-table-column>

      <el-table-column label="可选值">
        <template #default="{ row }">
          <div v-for="value in row.values" :key="value.uuid" style="margin-bottom: 8px; line-height: 1.4;">
            <div>
              <span style="font-weight: 500;">{{ value.value }}</span>
              <span style="color: #f56c6c; margin-left: 5px;">
                (+{{ value.priceAdjustment.toFixed(1) }} 元)
              </span>
            </div>

            <div 
              v-if="value.inventoryList && value.inventoryList.length > 0" 
              style="font-size: 12px; color: #909399; margin-left: 8px;"
            >
              <span style="margin-right: 4px;">额外原料:</span>
              <span v-for="(item, index) in value.inventoryList" :key="index">
                {{ getInventoryName(item.uuid) }} 
                <span style="color: #606266; font-weight: bold;">
                  {{ item.amount }} {{ inventories.find(inv => inv.id === item.uuid)?.unit }}
                </span>
                <span v-if="index < value.inventoryList.length - 1">, </span>
              </span>
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="">
        <template #default="{ row }">
          <el-button type="primary" @click="openEditDialog(row)">编辑</el-button>
          <el-button type="danger" @click="deleteOption(row)">删除</el-button>
        </template>
      </el-table-column>
    </el-table>

    <!-- 创建/编辑商品选项对话框 -->
    <el-dialog v-model="isEditDialogVisible" width="50%" title="编辑商品选项">
      <el-form v-if="editableOption" :model="editableOption" ref="optionForm">
        <el-form-item
          label="名称"
          :rules="[{ required: true, message: '请输入名称', trigger: 'blur' }]"
        >
          <el-input v-model="editableOption.name"></el-input>
        </el-form-item>

        <el-form-item label="可选值/价格调整/原料调整">
          <div
            v-for="(value, index) in editableOption.values"
            :key="value.uuid || index"
            class="option-value-card"
          >
            <div class="card-header-row">
              <el-row :gutter="10" align="middle">
                <el-col :span="9">
                  <el-form-item
                    :prop="'values.' + index + '.value'"
                    :rules="[{ required: true, message: '请输入名称', trigger: 'blur' }]"
                    style="margin-bottom: 0;"
                  >
                    <el-input v-model="value.value" placeholder="选项名称" />
                  </el-form-item>
                </el-col>
                
                <el-col :span="10">
                  <el-input-number
                    v-model.number="value.priceAdjustment"
                    :min="0"
                    placeholder="价格调整"
                    :precision="1"
                    :step="0.1"
                    style="width: 100%;"
                  >
                    <template #prefix>￥</template>
                  </el-input-number>
                </el-col>
                
                <el-col :span="5" style="text-align: right;">
                  <el-button type="danger" link @click="removeOptionValue(index)">
                    <el-icon><Delete /></el-icon> 删除
                  </el-button>
                </el-col>
              </el-row>
            </div>

            <div class="inventory-config-area">
              <div class="area-title">原料消耗配置 (可选)</div>

              <div v-if="value.inventoryList && value.inventoryList.length > 0" class="inventory-list">
                <div
                  v-for="(item, iIndex) in value.inventoryList"
                  :key="iIndex"
                  class="inventory-item-row"
                >
                  <span class="inventory-name">
                    {{ getInventoryName(item.uuid) }}
                  </span>
                  
                  <div class="inventory-actions">
                    <el-input-number
                      :model-value="item.amount"
                      :min="0"
                      :step="1"
                      :precision="1"
                      size="small"
                      style="width: 110px;"
                      @update:model-value="(val) => updateInventoryQuantity(index, iIndex, val)"
                    />
                    <span class="unit-text">
                      {{ inventories?.find(inv => inv.id === item.uuid)?.unit }}
                    </span>
                    <el-button type="danger" link size="small" @click="removeInventory(index, iIndex)">移除</el-button>
                  </div>
                </div>
              </div>
              
              <div v-else class="no-inventory-text">
                暂无额外原料消耗
              </div>

              <div class="add-inventory-box">
                <el-select
                  v-if="inventoryInputs[index]"
                  v-model="inventoryInputs[index].inventoryId"
                  placeholder="选择原料添加..."
                  size="small"
                  style="flex: 2;"
                  filterable
                >
                  <el-option
                    v-for="inventory in inventories"
                    :key="inventory.id"
                    :label="`${inventory.name} (${inventory.unit})`"
                    :value="inventory.id"
                  />
                </el-select>
                
                <el-input-number
                  v-if="inventoryInputs[index]"
                  v-model.number="inventoryInputs[index].quantity"
                  :min="0"
                  :step="1"
                  :precision="1"
                  placeholder="数量"
                  size="small"
                  style="flex: 1;"
                />
                
                <el-button type="primary" size="small" plain @click="addInventoryToValue(index)">
                  + 添加
                </el-button>
              </div>
            </div>
          </div>

        
        </el-form-item>

        <el-form-item>
          <el-button type="primary" @click="addOptionValue">添加可选值</el-button>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button type="primary" @click="saveOptionChanges" :loading="isSaving">保存</el-button>
        <el-button @click="cancelEdit">取消</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import {
  getAllProductOptions,
  getAllInventories,
  createProductOption,
  updateProductOption,
  deleteProductOption
} from '../client/services.gen'; // 更新服务路径
import type { ProductOption, OptionValue, Inventory } from '../client/types.gen';

import '../assets/web.css'

const options = ref<ProductOption[]>([]);
const isEditDialogVisible = ref(false);
const isSaving = ref(false);
const editableOption = ref<ProductOption | null>(null);
const isCreating = ref(false);
const optionForm = ref(null);

// 额外原料选项
const inventories = ref<Inventory | null>(null);
const inventoryInputs = ref<{ inventoryId: string; quantity: number }[]>([]);

// 获取商品选项
const fetchOptions = async () => {
  try {
    const response = await getAllProductOptions();
    // Convert priceAdjustment from fen to yuan when receiving data
    options.value = response.data.map(option => ({
      ...option,
      values: option.values.map(value => ({
        ...value,
        priceAdjustment: value.priceAdjustment / 100
      }))
    }));
  } catch (error) {
    console.error('获取商品选项时出错:', error);
  }
};

// 删除商品选项
const deleteOption = async (option: ProductOption) => {
  try {
    await deleteProductOption({
      path: {
        id: option.id,
      }
    });
    ElMessage.success('商品选项删除成功');
    await fetchOptions();
  } catch (error) {
    console.error('删除商品选项时出错:', error);
    ElMessage.error('商品选项删除失败，可能正在被使用');
  }
};

const fetchInventories = async () => {
  try {
    const response = await getAllInventories();
    inventories.value = (response.data as unknown as Inventory[]).filter(inv => !inv.deleted);
    console.log('inventories:', inventories.value);
  } catch (error) {
    console.error('获取原料出错:', error);
  }
};

const getInventoryName = (inventoryId: string): string => {
  const inventory = inventories.value.find(inv => inv.id === inventoryId);
  return inventory ? inventory.name || '未知原料' : '未知原料';
};

const addInventoryToValue = (valueIndex: number) => {
  const inputState = inventoryInputs.value[valueIndex];
  const targetValue = editableOption.value?.values[valueIndex];

  if (!inputState || !targetValue) return;

  if (!inputState.inventoryId || inputState.quantity <= 0) {
    ElMessage.warning('请选择原料并输入正确的数量');
    return;
  }

  if (!targetValue.inventoryList) {
    targetValue.inventoryList = [];
  }

  const exists = targetValue.inventoryList.some(
    item => item.uuid === inputState.inventoryId
  );

  if (exists) {
    ElMessage.warning('该原料已在此选项中添加，请勿重复添加');
    return;
  }

  targetValue.inventoryList.push({
    uuid: inputState.inventoryId,
    amount: inputState.quantity
  });

  inputState.inventoryId = '';
  inputState.quantity = 0;
};

const removeInventory = (valueIndex: number, inventoryIndex: number) => {
  const targetValue = editableOption.value?.values[valueIndex];
  if (targetValue?.inventoryList) {
    targetValue.inventoryList.splice(inventoryIndex, 1);
  }
};

const updateInventoryQuantity = (valueIndex: number, inventoryIndex: number, newQuantity: number) => {
  const targetValue = editableOption.value?.values[valueIndex];
  if (targetValue?.inventoryList && targetValue.inventoryList[inventoryIndex]) {
    targetValue.inventoryList[inventoryIndex].amount = newQuantity;
  }
};

const initInventoryInputs = (count: number) => {
  inventoryInputs.value = Array(count).fill(null).map(() => ({
    inventoryId: '',
    quantity: 0
  }));
};

// 打开编辑对话框
const openEditDialog = (option: ProductOption) => {
  // Deep clone the option to avoid mutating the original data
  editableOption.value = JSON.parse(JSON.stringify(option));
  initInventoryInputs(editableOption.value?.values.length || 0);

  // No need to convert priceAdjustment again
  // Since it was already converted in fetchOptions

  isCreating.value = false;
  isEditDialogVisible.value = true;
};

// 打开新建对话框
const openCreateDialog = () => {
  editableOption.value = {
    name: '',
    values: [
      {
        uuid: Date.now().toString(),
        value: '',
        priceAdjustment: 0,
        inventoryList: []
      }
    ]
  };
  initInventoryInputs(1);
  isCreating.value = true;
  isEditDialogVisible.value = true;
};

// 添加新的值
const addOptionValue = () => {
  if (editableOption.value) {
    editableOption.value.values.push({
      uuid: Date.now().toString(), // 唯一标识符
      value: '',
      priceAdjustment: 0 // Initialize in yuan
    });
    inventoryInputs.value.push({ inventoryId: '', quantity: 0 });
  }
};

// 删除某个值
const removeOptionValue = (index: number) => {
  if (editableOption.value && editableOption.value.values.length > 1) {
    editableOption.value.values.splice(index, 1); // 删除指定索引的值
    inventoryInputs.value.splice(index, 1);
  } else {
    ElMessage.warning('至少需要一个可选值');
  }
};

// 取消编辑
const cancelEdit = () => {
  isEditDialogVisible.value = false;
  fetchOptions(); // 重新获取商品选项列表
  fetchInventories();
};

// 保存更改
const saveOptionChanges = async () => {
  if (!editableOption.value) return;

  isSaving.value = true;
  try {
    // Before sending data, convert priceAdjustment back to fen
    const optionToSend = {
      ...editableOption.value,
      values: editableOption.value.values.map(value => ({
        ...value,
        priceAdjustment: Math.round(value.priceAdjustment * 100)
      }))
    };

    if (isCreating.value) {
      // 创建新的商品选项
      await createProductOption({
        body: optionToSend,
        method: 'POST'
      });
      ElMessage.success('商品选项创建成功');
    } else {
      // 更新已有的商品选项
      await updateProductOption({
        body: optionToSend,
        method: 'PUT'
      });
      ElMessage.success('商品选项修改成功');
    }

    await fetchOptions();
    await fetchInventories();
    isEditDialogVisible.value = false;
  } catch (error) {
    console.error('保存商品选项时出错:', error);
    ElMessage.error('保存失败！');
  } finally {
    isSaving.value = false;
  }
};

onMounted(async () => {
  await fetchOptions();
  await fetchInventories();
});
</script>