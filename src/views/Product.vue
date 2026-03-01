<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import {
  uploadImage,
  getAllProductsShop,
  getAllProductCatesShop,
  getAllProductOptions,
  updateProduct,
  createProduct,
  replenishProduct,
  getAllInventories
} from '../client/services.gen';
import type { Product, ProductOption, OptionValue, Order, ProductCate, Inventory } from '../client/types.gen';
import {
  ElMessage,
  ElTable,
  ElTableColumn,
  ElButton,
  ElDialog,
  ElForm,
  ElFormItem,
  ElInput,
  ElSelect,
  ElOption,
  ElPagination,
  ElInputNumber,
  ElRadioGroup,
  ElRadio
} from 'element-plus';

import '../assets/web.css'

const products = ref<Product[]>([]);
const productCategories = ref<Map<string, string>>(new Map());
const productOptions = ref<Map<string, ProductOption>>(new Map());
const isDeleteDialogVisible = ref(false);
const isEditDialogVisible = ref(false);
const isReplenishDialogVisible = ref(false);
const isDeleting = ref(false);
const isSaving = ref(false);
const isReplenishing = ref(false);
const productToDelete = ref<Product | null>(null);
const editableProduct = ref<Product | null>(null);

const imageFile = ref<File | null>(null);
const imagePreview = ref<string | null>(null);
const isCreating = ref(false);

const selectedOptionValues = ref<{ [key: string]: string[] }>({});

const newOptionId = ref('');

const replenishProductTo = ref<Product | null>(null);
const replenishQuantity = ref<number>(0);

const inventories = ref<Inventory[]>([]);
const newInventoryId = ref<string>('');
const newInventoryQuantity = ref<number>(0);

const availableOptions = computed(() => {
  const selectedOptionIds = Object.keys(editableProduct.value?.productOptions || {});
  return Array.from(productOptions.value.values()).filter(
    option => !selectedOptionIds.includes(option.id!.toString())
  );
});

const getAvailableOptionValues = (optionId: string) => {
  const option = productOptions.value.get(optionId);
  if (!option) return [];
  const selectedValues = new Set(
    (editableProduct.value?.productOptions?.[optionId] || []).map(v => v.uuid)
  );
  return option.values?.filter(value => !selectedValues.has(value.uuid)) || [];
};

const getOptionName = (optionId: string) => {
  const option = productOptions.value.get(optionId);
  return option ? option.name : '未知选项';
};

const addOption = () => {
  if (!newOptionId.value) return;
  if (!editableProduct.value?.productOptions) {
    editableProduct.value!.productOptions = {};
  }
  editableProduct.value!.productOptions[newOptionId.value] = [];
  selectedOptionValues.value[newOptionId.value] = [];
  newOptionId.value = '';
};

const removeOption = (optionId: string) => {
  if (editableProduct.value?.productOptions) {
    delete editableProduct.value.productOptions[optionId];
    delete selectedOptionValues.value[optionId];
  }
};

const onOptionValuesChange = (optionId: string) => {
  if (editableProduct.value?.productOptions) {
    console.log("selectedOptionValues:" + selectedOptionValues.value[optionId])
    editableProduct.value.productOptions[optionId] = selectedOptionValues.value[optionId].map(optionString => {
      const [value, priceAdjustmentString] = optionString.split(':');
      const priceAdjustment = parseFloat(priceAdjustmentString.replace('元', '')); // 去掉'元'并转换为数字

      // 在 productOptions 中查找匹配的选项
      const existingOption = productOptions.value.get(optionId)?.values.find(option => 
        option.value === value && option.priceAdjustment === priceAdjustment
      );

      console.log("existingOption:" + existingOption.value)

      return {
        uuid: existingOption?.uuid, // 使用已存在的 uuid
        value: value,
        priceAdjustment: priceAdjustment,
      } as OptionValue; // 断言为 OptionValue 类型
    });
  }
};

// 分页相关的变量
const currentPage = ref(1);   // 当前页码
const pageSize = ref(6);      // 每页展示的商品数量

// 计算分页后的商品列表
const paginatedProducts = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredProducts.value.slice(start, end);
});

const searchQuery = ref({
  name: '',
  cateId: '',
  status: null,
  needStockWithRestrictBuy: null, // 新增字段
});


const resetFilters = () => {
  searchQuery.value = { name: '', cateId: '', status: null, needStockWithRestrictBuy: null };
  currentPage.value = 1; // Reset to first page after resetting
};


const filteredProducts = computed(() => {
  return products.value.filter(product => {
    const matchesName = searchQuery.value.name === '' || product.name?.includes(searchQuery.value.name);
    const matchesCate = searchQuery.value.cateId === '' || productCategories.value.get(product.cateId.toString()) === searchQuery.value.cateId;
    const matchesStatus = searchQuery.value.status === null || product.status === searchQuery.value.status;
    const matchesNeedStockWithRestrictBuy = searchQuery.value.needStockWithRestrictBuy === null || product.needStockWithRestrictBuy === searchQuery.value.needStockWithRestrictBuy;
    return matchesName && matchesCate && matchesStatus && matchesNeedStockWithRestrictBuy && product.delete !== 1;
  });
});


const openEditDialog = (product: Product) => {
  editableProduct.value = {
    ...product,
    cateId: productCategories.value.get(product.cateId!.toString()) || '',
    productOptions: { ...product.productOptions },
    inventoryList: product.inventoryList ? product.inventoryList.map(item => ({ ...item })) : []
  };
  selectedOptionValues.value = {};
  if (product.productOptions) {
    for (const [optionId, values] of Object.entries(product.productOptions)) {
      selectedOptionValues.value[optionId] = values.map(value => `${value.value}:${value.priceAdjustment.toFixed(1)}元`);
    }
  }
  imageFile.value = null;
  imagePreview.value = product.imgURL || null;
  newInventoryId.value = '';
  newInventoryQuantity.value = 0;
  isCreating.value = false;
  isEditDialogVisible.value = true;
};

const saveProductChanges = async () => {
  if (!editableProduct.value) return;

  isSaving.value = true;
  let imageFilename = editableProduct.value.imgURL || '';

  try {
    if (imageFile.value) {
      try {
        const imageResponse = await uploadImage({
          body: {
            image: imageFile.value
          }
        });
        imageFilename = imageResponse.data;
      } catch (error) {
        console.error('Image upload failed:', error);
      }
    }

    if (imageFilename.includes('/')) {
      imageFilename = imageFilename.split('/').pop()!;
    }

    editableProduct.value.imgURL = imageFilename;

    const cateIdEntry = Array.from(productCategories.value.entries()).find(
      ([id, title]) => title === editableProduct.value!.cateId
    );
    if (cateIdEntry) {
      editableProduct.value.cateId = cateIdEntry[0];
    }

    console.log('editableProduct', editableProduct.value);

    const productToSend = {
      ...editableProduct.value,
      price: Math.round(editableProduct.value.price * 100),
      stock: editableProduct.value.stock || 0,
      presaleNum: editableProduct.value.presaleNum || 0,
      stocked: editableProduct.value.stocked || false,
      inventoryList: editableProduct.value.inventoryList || []
    };

    if (productToSend.productOptions) {
      const adjustedProductOptions = {};
      for (const [optionId, values] of Object.entries(productToSend.productOptions)) {
        adjustedProductOptions[optionId] = values.map(value => ({
          ...value,
          priceAdjustment: Math.round(value.priceAdjustment * 100)
        }));
      }
      productToSend.productOptions = adjustedProductOptions;
    }

    if (isCreating.value) {
      await createProduct({
        body: productToSend
      });
      ElMessage.success('Product created successfully');
    } else {
      console.log('productToSend', productToSend);  
      await updateProduct({
        body: productToSend,
        method: 'PUT',
        throwOnError: true
      })
        .then((result) => {
          console.log(result);
          ElMessage.success('Product updated successfully');
        })
        .catch((error) => {
          ElMessage.error('Product updated failed' + error);
        });
    }

    await fetchProducts();
    isEditDialogVisible.value = false;
  } catch (error) {
    console.error('Error saving product:', error);
    ElMessage.error('Failed to save product');
  } finally {
    isSaving.value = false;
  }
};

// const fetchProducts = async () => {
//   try {
//     const productResponse = await getAllProductsShop();
//     products.value = productResponse.data.map(product => {
//       // Adjust price from 'fen' to 'yuan'
//       const adjustedProduct = {
//         ...product,
//         price: product.price / 100,
//         stock: product.stock || 0,
//         presaleNum: product.presaleNum || 0,
//         stocked: product.stocked || false
//       };
//       // Adjust OptionValue.priceAdjustment
//       if (adjustedProduct.productOptions) {
//         const adjustedProductOptions = {};
//         for (const [optionId, values] of Object.entries(adjustedProduct.productOptions)) {
//           adjustedProductOptions[optionId] = values.map(value => ({
//             ...value,
//             priceAdjustment: value.priceAdjustment / 100
//           }));
//         }
//         adjustedProduct.productOptions = adjustedProductOptions;
//       }
//       return adjustedProduct;
//     });
//     console.log('products:', products.value);
//   } catch (error) {
//     console.error('Error fetching products:', error);
//   }
// };

const fetchProducts = async () => {
  try {
    const productResponse = await getAllProductsShop();
    products.value = productResponse.data.map(product => {
      // Adjust price from 'fen' to 'yuan'
      const adjustedProduct = {
        ...product,
        price: product.price / 100,
        stock: product.stock || 0,
        presaleNum: product.presaleNum || 0,
        stocked: product.stocked || false,
        needStockWithRestrictBuy: product.needStockWithRestrictBuy ?? false // 添加这一行
      };
      // Adjust OptionValue.priceAdjustment
      if (adjustedProduct.productOptions) {
        const adjustedProductOptions = {};
        for (const [optionId, values] of Object.entries(adjustedProduct.productOptions)) {
          adjustedProductOptions[optionId] = values.map(value => ({
            ...value,
            priceAdjustment: value.priceAdjustment / 100
          }));
        }
        adjustedProduct.productOptions = adjustedProductOptions;
      }
      return adjustedProduct;
    });
    console.log('products:', products.value);
  } catch (error) {
    console.error('Error fetching products:', error);
  }
};


const fetchProductCategories = async () => {
  try {
    const response = await getAllProductCatesShop();
    const categories: ProductCate[] = response.data
      .filter((category: ProductCate) => category.delete === 0) // Filter out deleted categories
      .sort((a: ProductCate, b: ProductCate) => b.priority - a.priority); // Sort by priority
    const categoryMap = new Map<string, string>();
    categories.forEach(category => {
      if (category.id && category.title) {
        categoryMap.set(category.id.toString(), category.title);
      }
    });
    productCategories.value = categoryMap;
  } catch (error) {
    console.error('Error fetching product categories:', error);
  }
};

const fetchProductOptions = async () => {
  try {
    const response = await getAllProductOptions();
    const options: ProductOption[] = response.data.map(option => ({
      ...option,
      values: option.values?.map(value => ({
        ...value,
        priceAdjustment: value.priceAdjustment / 100
      })) || []
    }));
    const optionMap = new Map<string, ProductOption>();
    options.forEach(option => {
      if (option.id) {
        optionMap.set(option.id.toString(), option);
      }
    });
    productOptions.value = optionMap;
  } catch (error) {
    console.error('Error fetching product options:', error);
  }
};

onMounted(async () => {
  try {
    await fetchProducts();
    await fetchProductCategories();
    await fetchProductOptions();
    await fetchInventories();
  } catch (error) {
    console.error('Error fetching products:', error);
  }
});

const getCategoryTitle = (cateId: string) => {
  return productCategories.value.get(cateId) || '未知分类';
};

const getStatusLabel = (status: number) => {
  return status === 1 ? '上架' : '下架';
};

const getProductOptionDisplay = (optionId: string, values: OptionValue[]) => {
  const option = productOptions.value.get(optionId);
  if (option) {
    const show_values =
      values
        ?.map(value => `${value.value}:${value.priceAdjustment.toFixed(1)}元`)
        .join(', ') || '无';
    return `${option.name}: [${show_values}]`;
  }
  return '未知选项';
};

const fetchInventories = async () => {
  try {
    const response = await getAllInventories();
    inventories.value = (response.data as unknown as Inventory[]).filter(inv => !inv.deleted);
    console.log('inventories:', inventories.value);
  } catch (error) {
    console.error('Error fetching inventories:', error);
  }
};

const getInventoryName = (inventoryId: string): string => {
  const inventory = inventories.value.find(inv => inv.id === inventoryId);
  return inventory ? inventory.name || '未知原料' : '未知原料';
};

const addInventory = () => {
  if (!newInventoryId.value || newInventoryQuantity.value <= 0) {
    ElMessage.warning('请选择原料并输入正确的数量');
    return;
  }
  
  if (!editableProduct.value?.inventoryList) {
    editableProduct.value!.inventoryList = [];
  }
  
  const exists = editableProduct.value.inventoryList.some(
    item => item.uuid === newInventoryId.value
  );
  
  if (exists) {
    ElMessage.warning('该原料已添加，请勿重复添加');
    return;
  }
  
  editableProduct.value.inventoryList.push({
    uuid: newInventoryId.value,
    amount: newInventoryQuantity.value
  });
  
  newInventoryId.value = '';
  newInventoryQuantity.value = 0;
};

const removeInventory = (index: number) => {
  if (editableProduct.value?.inventoryList) {
    editableProduct.value.inventoryList.splice(index, 1);
  }
};

const updateInventoryQuantity = (index: number, newQuantity: number) => {
  if (editableProduct.value?.inventoryList && editableProduct.value.inventoryList[index]) {
    editableProduct.value.inventoryList[index].amount = newQuantity;
  }
};

const confirmDelete = (product: Product) => {
  productToDelete.value = product;
  isDeleteDialogVisible.value = true;
};

const deleteProduct = async () => {
  if (!productToDelete.value) return;
  isDeleting.value = true;
  try {
    let imageFilename = productToDelete.value.imgURL;

    if (imageFilename.includes('/')) {
      imageFilename = imageFilename.split('/').pop();
    }
    const updatedProduct = {
      ...productToDelete.value,
      delete: 1,
      imgURL: imageFilename,
      price: Math.round(productToDelete.value.price * 100)
    };
    await updateProduct({ body: updatedProduct });
    await fetchProducts();
    isDeleteDialogVisible.value = false;
  } catch (error) {
    console.error('Error deleting product:', error);
  } finally {
    isDeleting.value = false;
  }
};

const openCreateDialog = () => {
  editableProduct.value = {
    name: '',
    price: 0,
    cateId: '',
    short_desc: '',
    describe: '',
    status: 1,
    imgURL: '',
    productOptions: {},
    inventoryList: [],
    onlyDining: false,
    onlyDelivery: false,
    no_coupon: false,
    needStockWithRestrictBuy: false,
    stock: 0,
    presaleNum: 0,
    stocked: false,
    rank: 0,
  };
  selectedOptionValues.value = {};
  imageFile.value = null;
  imagePreview.value = null;
  newInventoryId.value = '';
  newInventoryQuantity.value = 0;
  isCreating.value = true;
  isEditDialogVisible.value = true;
};

const onImageChange = (file: any) => {
  if (file && file.raw) {
    imageFile.value = file.raw;
    imagePreview.value = URL.createObjectURL(imageFile.value);
    console.log(imageFile.value);
  } else {
    console.error('No file selected');
  }
};

// Replenish Functions
const openReplenishDialog = (product: Product) => {
  replenishProductTo.value = product;
  replenishQuantity.value = 0;
  isReplenishDialogVisible.value = true;
};

const replenish = async () => {
  if (!replenishProductTo.value) return;
  const productId = replenishProductTo.value.id?.toString();
  if (!productId) {
    ElMessage.error('Invalid product ID');
    return;
  }
  if (replenishQuantity.value <= 0) {
    ElMessage.error('补货数量必须大于0');
    return;
  }
  isReplenishing.value = true;
  try {
    await replenishProduct({
        query: {
          productId,
          replenishQuantity: replenishQuantity.value
        }
    });
    ElMessage.success('补货成功');
    await fetchProducts(); // Refresh the products list
    isReplenishDialogVisible.value = false;
  } catch (error) {
    console.error('Error replenishing product:', error);
    ElMessage.error('补货失败');
  } finally {
    isReplenishing.value = false;
  }
};
</script>

<template>
  <div>
    <h3>搜索</h3>

    <el-form inline>
      <el-form-item label="名称">
        <el-input v-model="searchQuery.name" placeholder="输入商品名称"></el-input>
      </el-form-item>

      <el-form-item label="分类">
        <el-select v-model="searchQuery.cateId" placeholder="选择分类" style="width: 100pt;">
          <el-option
            v-for="(title, id) in productCategories"
            :key="id"
            :label="title[1]"
            :value="title[1]"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="状态">
        <el-select v-model="searchQuery.status" placeholder="选择状态" style="width: 100pt;">
          <el-option :label="'上架'" :value="1" />
          <el-option :label="'下架'" :value="0" />
        </el-select>
      </el-form-item>

      <el-form-item label="需要库存管理">
        <el-select v-model="searchQuery.needStockWithRestrictBuy" placeholder="选择是否需要库存管理" style="width: 150pt;">
          <el-option :label="'是'" :value="true" />
          <el-option :label="'否'" :value="false" />
          <el-option :label="'全部'" :value="null" />
        </el-select>
      </el-form-item>

      <el-form-item>
        <el-button @click="resetFilters">重置</el-button>
      </el-form-item>
    </el-form>

    <el-button type="primary" @click="openCreateDialog">创建商品</el-button>

    <h1>商品列表</h1>

    <el-table :data="paginatedProducts" stripe>
      <el-table-column prop="imgURL" label="图片" width="160px">
        <template #default="{ row }">
          <img
            :src="row.imgURL"
            alt="Product Image"
            v-if="row.imgURL"
            style="width: 100px; height: auto;"
          />
        </template>
      </el-table-column>

      <el-table-column label="名称/价格/分类" width="180px">
        <template #default="{ row }">
          <div>
            <div style="font-weight: bold;">{{ row.name }}</div>
            <div>{{ row.price.toFixed(1) }}元</div>
            <div>{{ getCategoryTitle(row.cateId) }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="简介/描述">
        <template #default="{ row }">
          <div>
            <div style="font-style: italic;">{{ row.short_desc }}</div>
            <div>{{ row.describe }}</div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="可选项">
        <template #default="{ row }">
          <div v-if="row.productOptions">
            <div v-for="(values, optionId) in row.productOptions" :key="optionId">
              {{ getProductOptionDisplay(String(optionId), values) }}
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="原始原料" width="160px">
        <template #default="{ row }">
          <div v-if="row.inventoryList">
            <div v-for="item in row.inventoryList" :key="item.uuid">
              {{ getInventoryName(item.uuid) }}: {{ item.amount }} {{ inventories.find(inv => inv.id === item.uuid)?.unit }}
            </div>
          </div>
        </template>
      </el-table-column>

      <el-table-column label="限定" width="120px">
        <template #default="{ row }">
          <span v-if="row.onlyDining">仅限堂食</span>
          <span v-else> - </span>
          <br />
          <span v-if="row.onlyDelivery">仅限定时达</span>
          <span v-else> - </span>
          <br />
          <span v-if="row.no_coupon">不可用优惠券</span>
          <span v-else> - </span>
        </template>
      </el-table-column>

      <el-table-column label="状态/排序" width="100px">
        <template #default="{ row }">
          <span>{{ getStatusLabel(row.status) }}</span>
          <br />
          <span v-if="row.rank">{{ row.rank }}</span>
          <span v-else> 0 </span>
        </template>
      </el-table-column>

      <el-table-column label="统计" width="100px">
        <template #default="{ row }">
          <div v-if="row.needStockWithRestrictBuy">
            <div>库存: {{ row.stock }}</div>
            <div>预售买数量: {{ row.presaleNum }}</div>
            <div>是否已补货: {{ row.stocked ? '是' : '否' }}</div>
          </div>
          <div v-else>
            -
          </div>
        </template>
      </el-table-column>

      <el-table-column label="编辑" >
        <template #default="{ row }">
          <el-button type="primary" @click="openEditDialog(row)">编辑</el-button>
          <el-button type="danger" @click="confirmDelete(row)">删除</el-button>
          <!-- 使用 v-if 直接控制是否渲染补货按钮 -->
          <el-button
            v-if="row.needStockWithRestrictBuy"
            type="warning"
            @click="openReplenishDialog(row)"
          >
            补货
          </el-button>
        </template>
      </el-table-column>

    </el-table>

    <!-- 分页组件 -->
    <el-pagination
      v-model:current-page="currentPage"
      :page-size="pageSize"
      :total="filteredProducts.length"
      layout="prev, pager, next"
    />

    <!-- Delete Confirmation Dialog -->
    <el-dialog v-model="isDeleteDialogVisible" width="30%" title="确认删除">
      <span>是否确认删除该商品？</span>
      <template #footer>
        <el-button type="primary" @click="deleteProduct" :loading="isDeleting">是</el-button>
        <el-button @click="isDeleteDialogVisible = false">否</el-button>
      </template>
    </el-dialog>

    <!-- Create/Edit Product Dialog -->
    <el-dialog v-model="isEditDialogVisible" width="50%" :title="isCreating ? '创建商品' : '编辑商品'">
      <el-form v-if="editableProduct" :model="editableProduct">
        <el-form-item label="名称">
          <el-input v-model="editableProduct.name"></el-input>
        </el-form-item>
        <el-form-item label="价格">
          <el-input-number v-model.number="editableProduct.price" :precision="1" :step="0.1" />
        </el-form-item>

        <el-form-item label="分类">
          <el-select v-model="editableProduct.cateId" placeholder="请选择分类">
            <el-option
              v-for="(title, id) in productCategories"
              :key="id"
              :label="title[1]"
              :value="title[1]"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="简介">
          <el-input v-model="editableProduct.short_desc" />
        </el-form-item>
        <el-form-item label="描述">
          <el-input type="textarea" v-model="editableProduct.describe" />
        </el-form-item>

        <el-form-item label="仅限堂食">
          <el-radio-group v-model="editableProduct.onlyDining">
            <el-radio :label="true">是</el-radio>
            <el-radio :label="false">否</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="仅限定时达">
          <el-radio-group v-model="editableProduct.onlyDelivery">
            <el-radio :label="true">是</el-radio>
            <el-radio :label="false">否</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="不可用优惠券">
          <el-radio-group v-model="editableProduct.no_coupon">
            <el-radio :label="true">是</el-radio>
            <el-radio :label="false">否</el-radio>
          </el-radio-group>
        </el-form-item>

        <el-form-item label="排序">
          <el-input-number v-model.number="editableProduct.rank" :step="1" />
        </el-form-item>

        <el-form-item label="商品状态">
          <el-radio-group v-model="editableProduct.status">
            <el-radio :label="1">上架</el-radio>
            <el-radio :label="0">下架</el-radio>
          </el-radio-group>
        </el-form-item>

        <!-- New Fields for Stock Management -->
        <el-form-item label="需要库存管理">
          <el-switch v-model="editableProduct.needStockWithRestrictBuy" active-text="是" inactive-text="否"></el-switch>
        </el-form-item>

        <div v-if="editableProduct.needStockWithRestrictBuy">
          <el-form-item label="库存数量">
            <el-input-number v-model.number="editableProduct.stock" :min="0" />
          </el-form-item>
          <el-form-item label="预售买数量">
            <el-input-number v-model.number="editableProduct.presaleNum" :min="0" />
          </el-form-item>
          <el-form-item label="是否已补货">
            <el-switch v-model="editableProduct.stocked" active-text="是" inactive-text="否"></el-switch>
          </el-form-item>
        </div>

        <el-form-item label="原料配置" style="width: 100%;">
          <div class="inventory-config-area" style="width: 100%;">
            <div class="area-title">商品基础原料消耗</div>

            <div v-if="editableProduct.inventoryList && editableProduct.inventoryList.length > 0">
              <div
                v-for="(item, index) in editableProduct.inventoryList"
                :key="index"
                class="inventory-item-row"
                style="width: 100%; box-sizing: border-box;" 
              >
                <span class="inventory-name">
                  {{ getInventoryName(item.uuid) }}
                </span>
                
                <div class="inventory-actions">
                  <el-input-number
                    :model-value="item.amount"
                    :min="0"
                    :step="1"
                    :precision="2"
                    size="small"
                    style="width: 120px;"
                    @update:model-value="(val) => updateInventoryQuantity(index, val)"
                  />
                  <span class="unit-text">
                    {{ inventories.find(inv => inv.id === item.uuid)?.unit }}
                  </span>
                  <el-button type="danger" link size="small" @click="removeInventory(index)">移除</el-button>
                </div>
              </div>
            </div>
            
            <div v-else class="no-inventory-text">
              暂未配置基础原料消耗
            </div>

            <div class="add-inventory-box" style="display: flex; width: 100%; gap: 10px;">
              <el-select
                v-model="newInventoryId"
                placeholder="选择原料添加..."
                size="small"
                style="flex: 1;"
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
                v-model.number="newInventoryQuantity"
                :min="0"
                :step="1"
                :precision="2"
                placeholder="数量"
                size="small"
                style="width: 120px;"
              />
              
              <el-button type="primary" size="small" plain @click="addInventory">
                 + 添加
              </el-button>
            </div>
          </div>
        </el-form-item>

        <el-form-item label="可选项" class="option-container">
          <div
            v-for="(values, optionId) in editableProduct.productOptions"
            :key="optionId"
            class="option-item"
          >
            <el-form-item>
              <div
                class="option-header"
                style="display: flex; justify-content: space-between; align-items: center; width: 100%;"
              >
                <div style="font-weight: bold;">
                  {{ getOptionName(String(optionId)) }}:
                </div>
                <el-button
                  type="danger"
                  size="small"
                  @click="removeOption(String(optionId))"
                  style="margin-left: auto;"
                >
                  删除该选项
                </el-button>
              </div>

              <el-select
                v-model="selectedOptionValues[optionId]"
                multiple
                placeholder="选择值"
                @change="onOptionValuesChange(String(optionId))"
                style="width: 100%;"
                class="custom-select"
              >
                <el-option
                  v-for="availableValue in getAvailableOptionValues(String(optionId))"
                  :key="availableValue.uuid"
                  :label="availableValue.value + ':' + availableValue.priceAdjustment.toFixed(1) + '元'"
                  :value="availableValue.value + ':' + availableValue.priceAdjustment.toFixed(1) + '元'"
                />
              </el-select>
            </el-form-item>
          </div>

          <el-form-item>
            <div style="font-weight: bold; margin-bottom: 5px; display: block; width: 100%;">
              添加新的选项:
            </div>

            <el-form-item>
              <el-select
                v-model="newOptionId"
                placeholder="选择要添加的选项"
                style="width: 150pt;"
              >
                <el-option
                  v-for="option in availableOptions"
                  :key="option.id"
                  :label="option.name"
                  :value="option.id"
                />
              </el-select>
            </el-form-item>

            <el-form-item>
              <el-button
                type="primary"
                size="small"
                @click="addOption"
                style="margin-left: 10px;"
              >
                添加选项
              </el-button>
            </el-form-item>
          </el-form-item>
        </el-form-item>
        
        <el-form-item label="上传图片">
          <img
            :src="imagePreview"
            v-if="imagePreview"
            style="width: 100px; height: auto; margin-right: 10px;"
          />
          <el-upload
            action=""
            :file-list="[]"
            :on-change="onImageChange"
            :show-file-list="false"
            :auto-upload="false"
          >
            <el-button type="primary">选择图片</el-button>
          </el-upload>
          <div style="color: #f56c6c; font-size: 12px; margin-top: 5px; width: 100%;">
            图片文件名禁止使用中文
          </div>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button type="primary" @click="saveProductChanges" :loading="isSaving">保存</el-button>
        <el-button @click="isEditDialogVisible = false">取消</el-button>
      </template>
    </el-dialog>

    <!-- Replenish Dialog -->
    <el-dialog v-model="isReplenishDialogVisible" width="30%" title="补货">
      <el-form>
        <el-form-item label="补货数量">
          <el-input-number v-model.number="replenishQuantity" :min="1" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" @click="replenish" :loading="isReplenishing">确认</el-button>
        <el-button @click="isReplenishDialogVisible = false">取消</el-button>
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
