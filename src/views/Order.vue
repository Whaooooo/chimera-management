<script setup lang="ts">
import { ref, onMounted, computed, onBeforeUnmount } from 'vue';
import {
  getAllOrders,
  getAllProductsShop,
  createOrderInStore,
  getAllProductOptions,
  supplyOrder,
  refundApply,
  batchSupplyOrders
} from '../client/services.gen';
import type { Order, Product, OptionValue, ProductOption, OrderApiParams, UserDTO, DeliveryInfo } from '../client/types.gen';
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
  ElDatePicker,
  ElRadioGroup,
  ElRadio,
  ElRow,
  ElCol,
  ElMessageBox,
  ElTabs,
  ElTabPane,
} from 'element-plus';
import { API_BASE_URL, LOCAL_AUTH_NAME } from '@/client/customize';
import { hiprint, hiPrintPlugin } from 'vue-plugin-hiprint';
import { USER_DTO } from '@/router';
import templateTag from '@/assets/printTag.json';
import { buildOrderTemplate } from '@/print/order-template';
import * as XLSX from 'xlsx';

// 初始化 hiprint
hiprint.init({
  host: 'http://localhost:17521',
});

// 订单数据
const orders = ref<Order[]>([]);
const productOptions = ref<Map<string, ProductOption>>(new Map());

// 分页相关的变量
const currentPage = ref(1); // 当前页码
const pageSize = ref(10); // 每页展示的订单数量

// Details dialog visibility and data
const orderDetailsDialogVisible = ref(false);
const selectedOrder = ref<Order | null>(null);

const selectedOrders = ref<Order[]>([]);

const selectAllOrders = () => {
  selectedOrders.value = paginatedOrders.value.slice(); // Select all visible orders
};

const deselectAllOrders = () => {
  selectedOrders.value = []; // Deselect all orders
};

const batchPrintOrders = () => {
  console.log("已选订单：", selectedOrders);
  selectedOrders.value.forEach(order => {
    printOrder(order); // Call the printOrder function for each selected order
  });
};

const BatchSupplyOrders = async () => {
  // Check if all selected orders have the status "待配送"
  const invalidOrders = selectedOrders.value.filter(order => order.state !== '待配送');
  
  if (invalidOrders.length > 0) {
    ElMessage.error('选了了非待配送订单');
    return; // Stop execution if any order is not "待配送"
  }

  const orderIds = selectedOrders.value.map(order => order.id.toString());
  
  try {
    await batchSupplyOrders({ body: { orderIds } });
    ElMessage.success('批量供餐成功');
    await fetchOrders(); // Refresh the order list
  } catch (error) {
    console.error('批量供餐时出错:', error);
    ElMessage.error('批量供餐时出错' + error);
  }
};


const handleSelectionChange = (selectedItems: Order[]) => {
  selectedOrders.value = selectedItems;
};



// 定义枚举选项
const stateOptions = [
  { label: '已支付', value: '已支付' },
  { label: '待出餐', value: '待出餐' },
  { label: '待配送', value: '待配送' },
  { label: '正常结束', value: '正常结束' },
  { label: '已退款', value: '已退款' },
];

const customerTypeOptions = [
  { label: '北大学生业务', value: '北大学生业务' },
  { label: '清华学生业务', value: '清华学生业务' },
  { label: '未学生认证业务', value: '未学生认证业务' },
];

const sceneOptionsSearch = [
  { label: '堂食', value: '堂食' },
  { label: '外带', value: '外带' },
  { label: '定时达', value: '定时达' },
];

const sceneOptions = [
  { label: '堂食', value: '堂食' },
  { label: '外带', value: '外带' },
];

const getDefaultStartTime = () => {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  date.setHours(0, 0, 0, 0);
  return date;
};

const getDefaultEndTime = () => {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
};


// 搜索相关
const searchQuery = ref({
  orderId: '',
  userId: '',
  orderNum: '',
  startTime: getDefaultStartTime(),
  endTime: getDefaultEndTime(),
  state: '',
  customerType: '',
  scene: '',
  school: '',
  address: '',
  time: '',
});


// 重置搜索条件
const resetFilters = () => {
  searchQuery.value = {
    orderId: '',
    userId: '',
    orderNum: '',
    startTime: getDefaultStartTime(),
    endTime: getDefaultEndTime(),
    state: '',
    customerType: '',
    scene: '',
    school: '',
    address: '',
    time: '',
  };
  currentPage.value = 1; // 重置为第一页
  fetchOrders(); // 重新获取订单数据
};

const resetState = () => {
  searchQuery.value.state = ''; // 手动重置属性为 ''
};

const resetScene = () => {
  searchQuery.value.scene = ''; // 手动重置属性为 ''
};

const resetSchool = () => {
  searchQuery.value.school = ''; // 手动重置属性为 ''
};

const resetAddress = () => {
  searchQuery.value.address = ''; // 手动重置属性为 ''
};

const resetTime = () => {
  searchQuery.value.time = ''; // 手动重置属性为 ''
};



const filteredOrders = computed(() => {
  return orders.value.filter((order) => {
    // 如果 searchQuery 中有定时达学校、地址或时间，则必须保证订单有 deliveryInfo
    if (
      (searchQuery.value.school && !order.deliveryInfo) ||
      (searchQuery.value.address && !order.deliveryInfo) ||
      (searchQuery.value.time && !order.deliveryInfo)
    ) {
      return false; // 如果有定时达学校、地址或时间值，但没有 deliveryInfo，则排除该订单
    }

    // 以下是原有的搜索过滤条件
    const matchesOrderNum =
      searchQuery.value.orderNum === '' ||
      order.orderNum?.toString().includes(searchQuery.value.orderNum);
    const matchesOrderId =
      searchQuery.value.orderId === '' ||
      order.id?.toString().includes(searchQuery.value.orderId);
    const matchesUserId =
      searchQuery.value.userId === '' ||
      order.userId?.toString().includes(searchQuery.value.userId);

    const matchesState =
      searchQuery.value.state === '' || order.state === searchQuery.value.state;
    const matchesCustomerType =
      searchQuery.value.customerType === '' ||
      order.customerType === searchQuery.value.customerType;
    const matchesScene =
      searchQuery.value.scene === '' || order.scene === searchQuery.value.scene;

    const matchesSchool =
      searchQuery.value.school === '' || order.deliveryInfo?.school === searchQuery.value.school;
    const matchesAddress =
      searchQuery.value.address === '' || order.deliveryInfo?.address === searchQuery.value.address;
    const matchesTime =
      searchQuery.value.time === '' || order.deliveryInfo?.time === searchQuery.value.time;

    return (
      matchesOrderNum &&
      matchesOrderId &&
      matchesUserId &&
      matchesState &&
      matchesCustomerType &&
      matchesScene &&
      matchesSchool &&
      matchesAddress &&
      matchesTime
    );
  });
});

// 计算分页后的订单列表
const paginatedOrders = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  const end = start + pageSize.value;
  return filteredOrders.value.slice(start, end);
});

const schoolOptions = ref<string[]>([]);
const addressOptions = ref<string[]>([]);
const timeOptions = ref<string[]>([]);

// 获取订单数据
const fetchOrders = async () => {
  try {
    let startTime = searchQuery.value.startTime || getDefaultStartTime();
    let endTime = searchQuery.value.endTime || getDefaultEndTime();

    // 确保开始时间为当天的 00:00:00，结束时间为当天的 23:59:59
    startTime = new Date(startTime);
    startTime.setHours(0, 0, 0, 0);

    endTime = new Date(endTime);
    endTime.setHours(23, 59, 59, 999);

    const response = await getAllOrders({
      query: {
        startTime: formatDate(startTime),
        endTime: formatDate(endTime),
      },
    });

    console.log(response.data)
    
    // 过滤掉 state 为 "已关单" 的订单
    orders.value = (response.data as unknown as Order[]).filter(order => order.state !== "已关单");


    console.log("Orders:", orders.value)

    // 提取定时达学校、地址和时间的唯一值
    const schools = new Set<string>();
    const addresses = new Set<string>();
    const times = new Set<string>();

    orders.value.forEach(order => {
      if (order.deliveryInfo) {
        if (order.deliveryInfo.school) schools.add(order.deliveryInfo.school);
        if (order.deliveryInfo.address) addresses.add(order.deliveryInfo.address);
        if (order.deliveryInfo.time) times.add(order.deliveryInfo.time);
      }
    });

    // 将 Set 转换为数组
    schoolOptions.value = Array.from(schools);
    addressOptions.value = Array.from(addresses);
    timeOptions.value = Array.from(times);
    

    // 处理订单数据（如添加商品名称等）
    orders.value.forEach((order) => {
      order.items?.forEach((item) => {
        if (item.productId) {
          const product = productOptionsList.value.find((p) => p.id === item.productId);
          if (product) {
            item.name = product.name || '未知产品';
          } else {
            item.name = '未知产品';
          }
        }
      });
    });
  } catch (error) {
    console.error('获取订单数据时出错:', error);
    ElMessage.error('获取订单数据时出错'+error);
  }
};

const fetchAllProductOptions = async () => {
  try {
    const response = await getAllProductOptions();
    const options: ProductOption[] = response.data;
    const optionMap = new Map<string, ProductOption>();
    options.forEach((option) => {
      if (option.id) {
        optionMap.set(option.id.toString(), option);
      }
    });
    productOptions.value = optionMap;
  } catch (error) {
    console.error('Error fetching product options:', error);
    ElMessage.error('Error fetching product options:'+error);
  }
};

let ws: WebSocket | null = null;
    let reconnectAttempts = 0; // 记录重连次数
    const maxReconnectAttempts = 5; // 最大重连次数
    const reconnectInterval = 3000; // 每次重连的时间间隔，单位：毫秒
    let isManuallyClosed = false; // 标志位：标记是否手动关闭 WebSocket
    const AUTHENTICATE="authenticate"
    const heartbeatIntervalTime =25000// 每25秒发送心跳
    let heartbeatInterval: ReturnType<typeof setInterval> | undefined;
    function startHeartbeat() {
    heartbeatInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
            console.log("Sending heartbeat...");
            ws.send("ping");  // 发送心跳消息
        }
    }, heartbeatIntervalTime);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = undefined;
  }
}

// 获取电话号码的后四位
const getLastFourDigits = (number: string): string => {
    const trimmedNumber = number.replace(/\D/g, '');  // 移除非数字字符
    return trimmedNumber.slice(-4);
};

// 组合地址
const getAddress = (deliveryInfo?: DeliveryInfo | null): string => {
    const school = deliveryInfo?.school ? deliveryInfo.school : "";
    const address = deliveryInfo?.address ? deliveryInfo.address : "";
    const combined = `${school} ${address}`.trim();
    return combined || "地址未提供";
};

// 格式化发送时间
const formatSendTime = (time: string): string => {
    const date = new Date(time);
    if (isNaN(date.getTime())) {
        return "无效时间";
    }
    const year = date.getFullYear();
    const month = padZero(date.getMonth() + 1); // 月份从0开始
    const day = padZero(date.getDate());
    const hours = padZero(date.getHours());
    const minutes = padZero(date.getMinutes());
    return `${year}-${month}-${day} ${hours}:${minutes}`;
};

// 辅助函数：补零
const padZero = (num: number): string => {
    return num < 10 ? `0${num}` : `${num}`;
};

const printOrderDetails = (
  finalItemDetails: any[],
  totalInfo: any,
  discountAmount: number,
  order_time: string,
  order: Order
) => {
  // 生成模板与数据
  const { template, printData } = buildOrderTemplate(
    finalItemDetails,
    totalInfo,
    discountAmount,
    order_time,
    order
  );

  console.log('打印结果：', JSON.stringify(template, null, 2));

  const hiprintTemplate = new hiprint.PrintTemplate({ template });

  // 模板对象获取
  
  const printerList = hiprintTemplate.getPrinterList();
  console.log("printerList:", JSON.stringify(printerList, null, 2));

  // 打印
  // hiprintTemplate.print2(printData, {printer: 'XP-80C (副本 1)'});
  // hiprintTemplate.print2(printData, {printer: 'Microsoft Print to PDF'});
  // hiprintTemplate.print2(printData, {printer: 'XP-80C'});
  hiprintTemplate.print2(printData, {printer: "Xprinter XP-236B"});
};

const printOrderTag = (tagInfo: any[], orderId: string, order_time: string) => {

// 遍历每个订单项，为每个项创建一个打印任务
tagInfo.forEach((item, index) => {
  // 每次循环都创建一个新的模板副本
  const template = JSON.parse(JSON.stringify(templateTag));

  // 设置基础信息，例如订单号和时间
  const orderInfoElement = template.panels[0].printElements.find(element => 
    element.options && element.options.title && element.options.title.includes('订单号')
  );
  const imageElement = template.panels[0].printElements.find(element => element.printElementType.type === 'image');
  
  if (imageElement) {
    imageElement.printElementType.title = '/taglogo.jpg';  // 假设公共目录直接访问
  }

  if (orderInfoElement) {
    orderInfoElement.options.title = `${orderId}`;
  }
  const timeElement = template.panels[0].printElements.find(element => 
    element.options && element.options.title && element.options.title.includes('时间')
  );

  if (timeElement) {
    timeElement.options.title = `${order_time}`;
  }

  // 添加当前订单项的 'name' 文本元素
  template.panels[0].printElements.push({
    options: {
      left: 7.5,
      top: 28.5, // 确定的位置
      height: 13.5,
      width: 70,
      title: item.name,
      fontSize: 11.25,
      fontWeight: "bolder"
    },
    printElementType: {
      type: "text"
    }
  });

  // 添加当前订单项的 'tag' 文本元素
  template.panels[0].printElements.push({
    options: {
      left: 7.5,
      top: 46.5, // 确定的位置
      height: 13.5,
      width: 76.5,
      title: item.tag,
      fontSize: 9
    },
    printElementType: {
      type: "text"
    }
  });

  // 创建打印模板对象并打印
  console.log("打印:", JSON.stringify(template)); // 更正打印输出，显示完整模板内容

  let hiprintTemplate = new hiprint.PrintTemplate({ template });
  const printData = {}
  // 模板对象获取
  // const printerList = hiprintTemplate.getPrinterList();
  // console.log("printerList:", JSON.stringify(printerList, null, 2));
  // Chimera
  // hiprintTemplate.print2(printData, {printer: "Xprinter XP-T202UA"});
  //YuanQi
  hiprintTemplate.print2(printData, {printer: "Xprinter XP-236B"});
});
};

const printOrder = (order: Order) => {

  // 存储最终结果的数组
  const itemDetails = order.items.map(item => {
        const options = item.optionValues ? Object.values(item.optionValues).map(option => option.value) : [];
        const quantity = 1; // 默认数量为1
        const price = item.price || 0; // 获取价格，默认为0
        const itemTotal = price * quantity; // 计算总价

        return {
            projectName: `${item.name}[${options.join(', ')}]`,
            quantity,
            price,
            itemTotal, // 添加 itemTotal 字段
        };
      });
  
  // 统计数量
  const quantityMap = new Map<string, number>();

  itemDetails.forEach(detail => {
    if (quantityMap.has(detail.projectName)) {
        quantityMap.set(detail.projectName, quantityMap.get(detail.projectName)! + 1);
    } else {
        quantityMap.set(detail.projectName, detail.quantity);
    }
  });

  // 构建最终结果
  const finalItemDetails = Array.from(quantityMap.entries()).map(([projectName, quantity]) => {
    const price = order.items.find(item => {
      const options = item.optionValues ? Object.values(item.optionValues).map(option => option.value) : [];
      return `${item.name}[${options.join(', ')}]` === projectName;
    })?.price;

    const itemTotal = (price || 0) * quantity; // 计算每个项目的总价

    return {
        projectName,
        quantity,
        price: price || 0,
        itemTotal, // 添加 itemTotal 字段
    };
  });

  // 输出最终结果
  console.log(finalItemDetails);

  // 计算总数量、总价格和总小计
  const totalInfo = finalItemDetails.reduce((acc, detail) => {
      acc.totalQuantity += detail.quantity;
      acc.totalItemTotal += detail.itemTotal;
      return acc;
  }, { totalQuantity: 0, totalItemTotal: 0 });

  // 输出 totalInfo
  console.log(totalInfo);

  // 计算优惠金额
  let discountAmount = 0;

  if (order.disPrice) {
    discountAmount = order.disPrice;
  } else if (order.coupon) {
    discountAmount = order.coupon.dePrice;
  }

  console.log(discountAmount);
  //处理打印模板
  // 初始位置

  let order_time = (function() {
      const now = new Date();
      const year = now.getFullYear();
      const month = String(now.getMonth() + 1).padStart(2, '0'); // 月份从0开始，需要加1
      const day = String(now.getDate()).padStart(2, '0');
      const hours = String(now.getHours()).padStart(2, '0');
      const minutes = String(now.getMinutes()).padStart(2, '0');
      return `${year}-${month}-${day} ${hours}:${minutes}`;
    })()

    
  // 检查是否是外送订单，如果不是直接跳过
  if (order.deliveryInfo) {
    printOrderDetails(finalItemDetails, totalInfo, discountAmount, order_time, order);
  }

  // 创建独立的 tagInfo 数组
  const tagInfo = order.items.map(item => {
      const options = item.optionValues ? Object.values(item.optionValues).map(option => option.value) : [];
      const name = item.name
      const tag = `${options.join('\\')}`; // 以 \\ 分隔选项
      return {
        tag,
        name
      };
  });

  console.log(tagInfo);
  printOrderTag(tagInfo, order.orderNum.toString(), order_time);

};

// 自动打印开关状态
const autoPrintDineInEnabled = ref(true);
const autoPrintTakeOutEnabled = ref(true);
const autoPrintFixDeliverEnabled = ref(false);

const connectWebSocket = () => {
  const auth=localStorage.getItem(LOCAL_AUTH_NAME)
  if(auth===null){
    ElMessage.error("localStorage中auth对应的值为空");
  }
  ws = new WebSocket(API_BASE_URL+"/ws/orders");

  ws.onopen = () => {
    console.log('WebSocket connected');
    ws?.send(AUTHENTICATE+":"+auth)
    reconnectAttempts = 0; // 连接成功后重置重连次数
    startHeartbeat();
  };

  ws.onmessage = async (event: MessageEvent) => {
    const msg=event.data as string;
    const dto=JSON.parse(msg)
    const state=dto.state as string
    if(state=="已支付"){
      await fetchOrders();
      const orderId = dto.orderId
      console.log("收到新订单号:", orderId); // 输出提取的订单号
      const order = orders.value.find(o => o.id.toString() === orderId);
      console.log("订单数据总:", orders); // 输出提取的订单号
      console.log("订单数据:", order); // 输出提取的订单号

      ElMessageBox.alert(
      event.data,
      '来新单辣！',
      {
        confirmButtonText: '确定',
        type: 'success',
      });
      if (autoPrintDineInEnabled.value && order.scene == "堂食") {
        printOrder(order);
      }
      if (autoPrintTakeOutEnabled.value && order.scene == "外带") {
        printOrder(order);
      }
      if (autoPrintFixDeliverEnabled.value && order.scene == "定时达") {
        printOrder(order);
      }
    }else if(state=="已退款"){
      await fetchOrders(); // 刷新订单列表
      ElMessageBox.alert(
      event.data,
      '已退款',
      {
        confirmButtonText: '确定',
        type: 'info',
      });
    }else if(state=="异常结束"){
      await fetchOrders(); // 刷新订单列表
      ElMessageBox.alert(
      event.data,
      '异常结束，店员可以主动和客户沟通处理',
      {
        confirmButtonText: '确定',
        type: 'warning',
      });
    }else{
      console.log("收到消息",msg)
    }
  };

  ws.onclose = () => {
    if (isManuallyClosed){
      console.log("WebSocket disconnected,isManuallyClosed,no reconnect")
      stopHeartbeat();
      return;
    }
    console.log('WebSocket disconnected'+reconnectAttempts+","+maxReconnectAttempts);
    if (reconnectAttempts < maxReconnectAttempts) {
      reconnectAttempts++;
      reconnectWebSocket(); // 尝试重连
    } else {
      console.error('Max reconnect attempts reached');
      stopHeartbeat();
      showReconnectAlert(); // 耗尽重连次数后显示弹窗
    }
  };

  ws.onerror = (error: Event) => {
    console.error('WebSocket error:', error);
    ws?.close(); // 发生错误时关闭连接，触发 onclose
  };
};

const reconnectWebSocket = () => {
  // if (reconnectTimer) return; // 如果已经有定时器，不重复设置

  console.log(`Reconnecting in ${reconnectInterval / 1000} seconds...`);
  // reconnectTimer = 
  window.setTimeout(() => {
    connectWebSocket();
  }, reconnectInterval);
};

// 显示重连失败弹窗
const showReconnectAlert = () => {
      ElMessageBox.alert(
        'WebSocket 重连失败，已达到最大重试次数，请检查网络或稍后再试。',
        '重连失败',
        {
          confirmButtonText: '确定',
          type: 'error',
        }
      );
    };

onMounted(async () => {
  try {
    await fetchProducts();
    await fetchOrders();
    await fetchAllProductOptions();
    connectWebSocket();
  } catch (error) {
    console.error('获取订单数据时出错:', error);
    ElMessage.error('获取订单数据时出错:'+error);
  }
});

onBeforeUnmount(()=>{
  isManuallyClosed = true; // 设置为手动关闭标志，避免重连
  if(ws){
    ws.close()
  }
})

// 日期格式化函数
const formatDate = (date: Date) => {
  // 格式化日期为 'yyyy-MM-ddTHH:mm:ss'
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0'); // 月份从 0 开始
  const day = String(date.getDate()).padStart(2, '0');

  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  const seconds = String(date.getSeconds()).padStart(2, '0');

  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`;
};

const showDate = (row: any): string => {
    const cellValue = row.createdAt;
    if (!cellValue) return '';

    try {
        // 解析ISO字符串到Date对象
        const date = new Date(cellValue);
        if (isNaN(date.getTime())) {
            // 无效日期，返回空字符串
            return '';
        }

        // 提取日期组件
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');

        // 返回格式化后的日期
        return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
    } catch (error) {
        // 捕获异常并返回空字符串
        return '';
    }
};

// 新建订单对话框状态
const newOrderDialogVisible = ref(false);

// 新建订单表单数据
interface NewOrderProduct {
  productId: string | null;
  selectedOptions: Record<string, string | null>;
  availableOptions: Record<string, OptionValue[]>;
  name: string | null;
  imgURL: string | null;
  price: number | null;
}

const newOrderForm = ref({
  products: [] as NewOrderProduct[],
  scene: '',
  disPrice: 0,
});

// 所有产品列表
const productOptionsList = ref<Product[]>([]);

// 获取所有产品
const fetchProducts = async () => {
  try {
    const productResponse = await getAllProductsShop();
    productOptionsList.value = productResponse.data;
  } catch (error) {
    console.error('获取产品数据时出错:', error);
    ElMessage.error('获取产品数据时出错'+ error);
  }
};

// 打开新建订单对话框时获取产品数据
const openNewOrderDialog = async () => {
  try {
    // 初始化新订单表单
    newOrderForm.value = {
      products: [],
      scene: '',
      disPrice: 0,
    };
    newOrderDialogVisible.value = true;
  } catch (error) {
    console.error('打开新建订单对话框时出错:', error);
    ElMessage.error('打开新建订单对话框时出错:'+ error);
  }
};

const openOrderDetailsDialog = (order: Order) => {
  selectedOrder.value = order;
  orderDetailsDialogVisible.value = true;
};

// 添加一个新的产品到订单中
const addProduct = () => {
  newOrderForm.value.products.push({
    productId: null,
    selectedOptions: {},
    availableOptions: {},
    name: null,
    imgURL: null,
    price: null
  });
};

// 删除订单中的某个产品
const removeProduct = (index: number) => {
  newOrderForm.value.products.splice(index, 1);
};

// 处理产品选择变化
const handleProductChange = (product: NewOrderProduct) => {
  const selectedProduct = productOptionsList.value.find((p) => p.id === product.productId);
  if (selectedProduct) {
    product.name = selectedProduct.name || '未知产品';
    product.imgURL = selectedProduct.imgURL || '未知产品';
    product.price = selectedProduct.price || 0;
  }

  if (selectedProduct && selectedProduct.productOptions) {
    const availableOptionsByName: { [key: string]: Array<OptionValue> } = {};

    for (const id in selectedProduct.productOptions) {
      if (selectedProduct.productOptions.hasOwnProperty(id)) {
        const option = productOptions.value.get(id);
        if (option && option.name) {
          availableOptionsByName[option.name] = selectedProduct.productOptions[id];
        } else {
          console.warn(`找不到 id 为 ${id} 的 ProductOption 或缺少 name 属性`);
        }
      }
    }

    product.availableOptions = availableOptionsByName;

    // 初始化 selectedOptions，使用 name 作为键
    product.selectedOptions = {};
    for (const name in availableOptionsByName) {
      if (availableOptionsByName.hasOwnProperty(name)) {
        product.selectedOptions[name] = null;
      }
    }
  } else {
    product.availableOptions = {};
    product.selectedOptions = {};
  }
};

// 搜索产品的方法
const fetchProductOptions = (query: string) => {
  if (query !== '') {
    productOptionsList.value = productOptionsList.value.filter((product) =>
      product.name?.toLowerCase().includes(query.toLowerCase())
    );
  }
};

// 提交新订单
const submitNewOrder = async () => {
  // 验证表单
  if (!newOrderForm.value.scene) {
    ElMessage.error('请选择场景');
    return;
  }

  if (newOrderForm.value.products.length === 0) {
    ElMessage.error('请至少添加一个商品');
    return;
  }

  for (const [index, product] of newOrderForm.value.products.entries()) {
    if (!product.productId) {
      ElMessage.error(`第 ${index + 1} 个商品未选择`);
      return;
    }
    // 验证所有选项是否已选择
    for (const key in product.availableOptions) {
      if (product.availableOptions.hasOwnProperty(key)) {
        if (!product.selectedOptions[key]) {
          ElMessage.error(`第 ${index + 1} 个商品的选项 "${key}" 未选择`);
          return;
        }
      }
    }
  }
  const str=localStorage.getItem(USER_DTO)
  const userDTO=JSON.parse(str as string) as UserDTO
  // 构建符合 Order 类型的订单数据
  const disPriceInCents = Math.round((newOrderForm.value.disPrice || 0) * 100);
  const orderData: OrderApiParams = {
    userId: userDTO.id, // 设置固定的用户ID
    scene: newOrderForm.value.scene,
    customerType: '未学生认证业务',
    disPrice: disPriceInCents,
    items: newOrderForm.value.products.map((product) => {
      const selectedOptions: Record<string, string> = {};
      for (const [name, uuid] of Object.entries(product.selectedOptions)) {
        for (const [optionId, option] of productOptions.value) {
          if (option.name === name) {
            selectedOptions[optionId] = uuid as string;
            break;
          }
        }
      }

      return {
        productId: product.productId as string,
        optionValues: selectedOptions,
      };
    }),
  };

  // // 替换 optionValues 中的 uuid 为 OptionValue 对象
  // for (const item of orderData.items || []) {
  //   const optionValuesWithDetails: Record<string, OptionValue> = {};
  //   for (const optionKey in item.optionValues) {
  //     if (item.optionValues.hasOwnProperty(optionKey)) {
  //       const uuid = item.optionValues[optionKey];
  //       // 在 productOptions 中找到对应的 OptionValue 对象
  //       for (const [optionId, option] of productOptions.value) {
  //         const optionValue = option.values.find((v) => v.uuid === uuid);
  //         if (optionValue) {
  //           optionValuesWithDetails[optionKey] = optionValue;
  //           break;
  //         }
  //       }
  //     }
  //   }
  //   // 将 optionValues 替换为完整的 OptionValue 对象
  //   item.optionValues = optionValuesWithDetails;
  // }


  console.log(orderData)

  try {
    await createOrderInStore({
      body: orderData,
    });
    ElMessage.success('订单创建成功');
    newOrderDialogVisible.value = false;
    await fetchOrders(); // 刷新订单列表
  } catch (error) {
    console.error('创建订单时出错:', error);
    ElMessage.error('创建订单时出错'+ error);
  }
};

// 新增供餐和退款处理函数
const handleSupplyOrder = async (order: Order) => {
  try {
    await supplyOrder({query:{orderId:order.id}});
    ElMessage.success('供餐成功');
    await fetchOrders(); // 刷新订单列表
  } catch (error) {
    console.error('供餐时出错:', error);
    ElMessage.error('供餐时出错' + error);
  }
};


const refundDialogVisible = ref(false);
const currentOrder = ref<Order | null>(null);
const refundReason = ref('');

// Open the refund confirmation dialog
const openRefundDialog = (order: Order) => {
  currentOrder.value = order;
  refundReason.value = ''; // Clear the note input
  refundDialogVisible.value = true;
};

// Confirm the refund action
const confirmRefund = async () => {
  if (!currentOrder.value) return;
  
  try {
    await refundApply({ body: {orderId:currentOrder.value.id,reason:refundReason.value }});
    ElMessage.success('退款申请成功');
    refundDialogVisible.value = false;
    await fetchOrders(); // Refresh the order list
  } catch (error) {
    console.error('退款申请时出错:', error);
    ElMessage.error('退款申请时出错'+error);
  }
};

// ==================== 批量导入订单功能 ====================
const batchImportDialogVisible = ref(false);
const batchImportJson = ref('');
const batchImportProgress = ref(0);
const batchImportTotal = ref(0);
const batchImportResults = ref<Array<{ success: boolean; message: string; orderData?: any }>>([]);

interface BatchOrderItem {
  productName: string;
  options: Record<string, string>;
}

interface BatchOrder {
  customerInfo?: {
    name?: string;
    phone?: string;
  };
  scene: string;
  deliveryLocation?: string;  // 仅用于外带/堂食订单，会添加到备注中
  deliveryInfo?: {  // 用于定时达订单
    school: string;
    address: string;
    time: string;  // 格式: "2025-11-20 12:45"
    number: string;
  };
  remark?: string;
  items: BatchOrderItem[];
}

interface BatchOrdersData {
  orders: BatchOrder[];
}

const openBatchImportDialog = () => {
  batchImportDialogVisible.value = true;
  batchImportJson.value = '';
  batchImportProgress.value = 0;
  batchImportTotal.value = 0;
  batchImportResults.value = [];
};

const findProductByName = (productName: string): Product | null => {
  const trimmedName = productName.trim();
  
  // 第一步：尝试精确匹配
  const exactMatch = productOptionsList.value.find(p => p.name?.trim() === trimmedName);
  if (exactMatch) {
    return exactMatch;
  }
  
  // 第二步：如果没有精确匹配，尝试模糊匹配（但优先匹配完整包含的）
  const fuzzyMatches = productOptionsList.value.filter(p => 
    p.name?.includes(trimmedName) || trimmedName.includes(p.name || '')
  );
  
  if (fuzzyMatches.length === 1) {
    return fuzzyMatches[0];
  }
  
  // 如果有多个模糊匹配，返回 null（要求用户使用精确名称）
  if (fuzzyMatches.length > 1) {
    console.warn(`商品名称 "${trimmedName}" 匹配到多个商品: ${fuzzyMatches.map(p => p.name).join(', ')}，请使用精确名称`);
    return null;
  }
  
  return null;
};

const findOptionValueByName = (optionName: string, valueName: string): { optionId: string; uuid: string } | null => {
  for (const [optionId, option] of productOptions.value) {
    if (option.name === optionName) {
      const value = option.values.find(v => v.value === valueName);
      if (value?.uuid) {
        return { optionId, uuid: value.uuid };
      }
    }
  }
  return null;
};

const processBatchImport = async () => {
  try {
    const data: BatchOrdersData = JSON.parse(batchImportJson.value);
    
    if (!data.orders || !Array.isArray(data.orders)) {
      ElMessage.error('JSON 格式错误：缺少 orders 数组');
      return;
    }

    batchImportTotal.value = data.orders.length;
    batchImportProgress.value = 0;
    batchImportResults.value = [];

    const str = localStorage.getItem(USER_DTO);
    const userDTO = JSON.parse(str as string) as UserDTO;

    for (const [index, batchOrder] of data.orders.entries()) {
      try {
        // 验证定时达订单必须包含 deliveryInfo
        if (batchOrder.scene === '定时达' && !batchOrder.deliveryInfo) {
          throw new Error('定时达订单必须包含 deliveryInfo（school, address, time, number）');
        }

        // 构建备注（仅用于非定时达订单）
        let fullRemark = '';
        if (batchOrder.scene !== '定时达') {
          if (batchOrder.deliveryLocation) {
            fullRemark += `【配送地点：${batchOrder.deliveryLocation}】`;
          }
          if (batchOrder.customerInfo?.name) {
            fullRemark += `【客户：${batchOrder.customerInfo.name}】`;
          }
          if (batchOrder.customerInfo?.phone) {
            fullRemark += `【电话：${batchOrder.customerInfo.phone}】`;
          }
        }
        if (batchOrder.remark) {
          fullRemark += fullRemark ? ` ${batchOrder.remark}` : batchOrder.remark;
        }

        // 处理商品和选项
        const items: Array<{ productId: string; optionValues: Record<string, string> }> = [];
        
        for (const item of batchOrder.items) {
          const product = findProductByName(item.productName);
          if (!product?.id) {
            throw new Error(`找不到商品：${item.productName}`);
          }

          const optionValues: Record<string, string> = {};
          for (const [optionName, valueName] of Object.entries(item.options)) {
            const result = findOptionValueByName(optionName, valueName);
            if (result) {
              optionValues[result.optionId] = result.uuid;
            } else {
              console.warn(`找不到选项：${optionName} = ${valueName}，跳过此选项`);
            }
          }

          items.push({
            productId: product.id,
            optionValues
          });
        }

        // 创建订单
        const orderData: OrderApiParams = {
          userId: userDTO.id,
          scene: batchOrder.scene || '外带',
          customerType: '未学生认证业务',
          disPrice: 0,
          items,
          remark: fullRemark
        };

        // 如果是定时达订单，添加 deliveryInfo
        if (batchOrder.scene === '定时达' && batchOrder.deliveryInfo) {
          // 将时间字符串转换为 ISO 8601 格式
          const timeStr = batchOrder.deliveryInfo.time;
          let isoTime: string;
          
          // 如果已经是 ISO 格式，直接使用
          if (timeStr.includes('T') || timeStr.includes('+')) {
            isoTime = timeStr;
          } else {
            // 否则转换为 ISO 格式（假设用户输入的是本地时间）
            const date = new Date(timeStr);
            if (isNaN(date.getTime())) {
              throw new Error(`无效的时间格式：${timeStr}，请使用 "YYYY-MM-DD HH:mm" 格式`);
            }
            isoTime = date.toISOString();
          }
          
          orderData.deliveryInfo = {
            school: batchOrder.deliveryInfo.school,
            address: batchOrder.deliveryInfo.address,
            time: isoTime,
            number: batchOrder.deliveryInfo.number
          };
        }

        await createOrderInStore({ body: orderData });

        batchImportResults.value.push({
          success: true,
          message: `订单 ${index + 1} 创建成功`,
          orderData: batchOrder
        });

        batchImportProgress.value++;

      } catch (error: any) {
        batchImportResults.value.push({
          success: false,
          message: `订单 ${index + 1} 失败: ${error.message || error}`,
          orderData: batchOrder
        });
        batchImportProgress.value++;
      }
    }

    ElMessage.success(`批量导入完成：成功 ${batchImportResults.value.filter(r => r.success).length}/${batchImportTotal.value}`);
    await fetchOrders(); // 刷新订单列表

  } catch (error: any) {
    console.error('批量导入失败:', error);
    ElMessage.error('JSON 解析失败: ' + error.message);
  }
};

const downloadTemplate = () => {
  const template = {
    orders: [
      {
        customerInfo: {
          name: "张三",
          phone: "13800138000"
        },
        scene: "外带",
        deliveryLocation: "北京大学东门",
        remark: "请快点",
        items: [
          {
            productName: "美式咖啡",
            options: {
              "温度": "热",
              "糖度": "少糖",
              "杯型": "大杯"
            }
          }
        ]
      },
      {
        scene: "定时达",
        deliveryInfo: {
          school: "咖啡—燕园",
          address: "#7 图书馆南门",
          time: "2025-11-20 12:45",
          number: "18156657202"
        },
        remark: "需要打包好",
        items: [
          {
            productName: "话梅气泡美式",
            options: {
              "温度": "少冰"
            }
          }
        ]
      }
    ]
  };

  const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'batch_orders_template.json';
  a.click();
  URL.revokeObjectURL(url);
};

// ==================== XLSX 批量导入订单功能 ====================

const xlsxFile = ref<File | null>(null);
const xlsxImportProgress = ref(0);
const xlsxImportTotal = ref(0);
const xlsxImportResults = ref<Array<{ success: boolean; message: string; orderData?: any }>>([]);
const isXlsxProcessing = ref(false);

// 处理文件选择
const handleXlsxFileChange = (event: Event) => {
  const target = event.target as HTMLInputElement;
  if (target.files && target.files.length > 0) {
    xlsxFile.value = target.files[0];
    xlsxImportProgress.value = 0;
    xlsxImportTotal.value = 0;
    xlsxImportResults.value = [];
    target.value = '';
    ElMessage.success(`已选择文件: ${xlsxFile.value.name}`);
  }
};

// 解析饮品字符串，提取产品名称
const parseDrinkString = (drinkStr: string): string[] => {
  if (!drinkStr) return [];

  const drinks: string[] = [];
  const normalized = drinkStr.replace(/\s+/g, ' ');

  const pattern = /】([^：:]+)[：:]/g;
  let match;
  while ((match = pattern.exec(normalized)) !== null) {
    const name = match[1]?.trim();
    if (name) drinks.push(name);
  }

  if (drinks.length === 0) {
    normalized.split(/[，,|、]/).forEach((part) => {
      const clean = part.replace(/【[^】]*】/g, '').replace(/[：:].*/, '').trim();
      if (clean) drinks.push(clean);
    });
  }

  return drinks;
};

// 解析温度，兼容冰/热/常温
const detectTemperature = (tempStr: string): string | null => {
  if (!tempStr) return null;
  const normalized = tempStr.replace(/[！!]/g, '').trim();

  if (normalized.includes('冰')) return '冰';
  if (normalized.includes('常温')) return '常温';
  if (normalized.includes('热') || normalized.includes('温')) return normalized.includes('热') ? '热' : '温';
  return null;
};

// 是否加燕麦奶
const shouldAddOatMilk = (oatMilkStr: string): boolean => {
  if (!oatMilkStr || oatMilkStr.trim() === '') {
    return false;
  }
  const normalized = oatMilkStr.replace(/[！!。.\s]/g, '');

  if (normalized.includes('不') || normalized.includes('无')) return false;

  return normalized.includes('换') || normalized.includes('要') || normalized.includes('加');
};

// Parse delivery location (column 4/5)
const parseDeliveryLocation = (locationMain: string, locationExtra?: string): { school: string; address: string } => {
  const main = (locationMain || '').trim();
  const extra = (locationExtra || '').trim();

  if (!main && !extra) return { school: '', address: '' };

  let school = main;
  let address = '';

  const separator = main.includes('：') ? '：' : main.includes(':') ? ':' : '';
  if (separator) {
    const parts = main.split(separator);
    school = parts[0].trim();
    address = parts.slice(1).join(separator).trim();
  }

  if (extra) {
    address = extra;
  }

  if (!school && address) {
    school = main || address;
  }

  return { school, address };
};

// Parse time cell, support text and Excel serial numbers
const parseTimeToIsoString = (timeCell: any): string => {
  if (timeCell === undefined || timeCell === null || timeCell === '') {
    throw new Error('缺少送达时间');
  }

  if (typeof timeCell === 'number' && XLSX.SSF && XLSX.SSF.parse_date_code) {
    const parsed = XLSX.SSF.parse_date_code(timeCell);
    if (parsed) {
      const date = new Date(
        parsed.y,
        (parsed.m || 1) - 1,
        parsed.d || 1,
        parsed.H || 0,
        parsed.M || 0,
        parsed.S || 0
      );
      return date.toISOString();
    }
  }

  const normalized = timeCell.toString().replace(/：/g, ':').trim();
  const date = new Date(normalized);
  if (isNaN(date.getTime())) {
    throw new Error(`无效的送达时间格式：${timeCell}`);
  }

  return date.toISOString();
};
const processXlsxImport = async () => {
  if (!xlsxFile.value) {
    ElMessage.error('请先选择 XLSX 文件');
    return;
  }

  isXlsxProcessing.value = true;
  try {
    const fileData = await xlsxFile.value.arrayBuffer();
    const workbook = XLSX.read(fileData);

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const data: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    if (data.length <= 1) {
      ElMessage.error('XLSX 文件没有数据行');
      return;
    }

    const dataRows = data
      .slice(1)
      .filter(row => row.some(cell => cell !== undefined && cell !== null && cell !== ''));

    xlsxImportTotal.value = dataRows.length;
    xlsxImportProgress.value = 0;
    xlsxImportResults.value = [];

    const str = localStorage.getItem(USER_DTO);
    const userDTO = JSON.parse(str as string) as UserDTO;

    for (const [index, row] of dataRows.entries()) {
      try {
        // 新模板列顺序：3=地点、4=补充地点、5=送达时间、6=饮品、7=冰/热、8=燕麦奶
        const locationMain = row[3]?.toString().trim() || '';
        const locationExtra = row[4]?.toString().trim() || '';
        const timeCell = row[5];
        const drinkStr = row[6]?.toString().trim() || '';
        const tempStr = row[7]?.toString().trim() || '';
        const oatMilkStr = row[8]?.toString().trim() || '';

        if ((!locationMain && !locationExtra) || !timeCell || !drinkStr) {
          throw new Error('缺少必填字段：时间、地点、饮品');
        }

        const isoTime = parseTimeToIsoString(timeCell);

        const location = parseDeliveryLocation(locationMain, locationExtra);
        if (!location.school) {
          throw new Error(`无效的送达地点：${locationMain || locationExtra}`);
        }

        const productNames = parseDrinkString(drinkStr);
        if (productNames.length === 0) {
          throw new Error(`无法解析饮品：${drinkStr}`);
        }

        const temperature = detectTemperature(tempStr);
        const needOatMilk = shouldAddOatMilk(oatMilkStr);

        const items: Array<{ productId: string; optionValues: Record<string, string> }> = [];

        for (const productName of productNames) {
          const product = findProductByName(productName);
          if (!product?.id) {
            throw new Error(`找不到商品：${productName}`);
          }

          const optionValues: Record<string, string> = {};

          if (temperature) {
            const tempOption = findOptionValueByName('温度', temperature);
            if (tempOption) {
              optionValues[tempOption.optionId] = tempOption.uuid;
            }
          }

          if (needOatMilk) {
            const oatMilkOption = findOptionValueByName('燕麦奶', '燕麦奶');
            if (oatMilkOption) {
              optionValues[oatMilkOption.optionId] = oatMilkOption.uuid;
            }
          }

          items.push({
            productId: product.id,
            optionValues
          });
        }

        const orderData: OrderApiParams = {
          userId: userDTO.id,
          scene: '定时达',
          customerType: '未学生认证业务',
          disPrice: 0,
          items,
          deliveryInfo: {
            school: location.school,
            address: location.address,
            time: isoTime,
            number: '' // XLSX 中没有电话号码，使用空字符串
          },
          remark: ''
        };

        await createOrderInStore({ body: orderData });

        xlsxImportResults.value.push({
          success: true,
          message: `第 ${index + 2} 行，订单创建成功 (${productNames.join(', ')})`,
          orderData: { locationMain, locationExtra, drinkStr, tempStr, productNames }
        });
      } catch (error: any) {
        xlsxImportResults.value.push({
          success: false,
          message: `第 ${index + 2} 行失败: ${error.message || error}`,
          orderData: row
        });
      } finally {
        xlsxImportProgress.value++;
      }
    }

    ElMessage.success(`XLSX 导入完成：成功 ${xlsxImportResults.value.filter(r => r.success).length}/${xlsxImportTotal.value}`);
    await fetchOrders();
  } catch (error: any) {
    console.error('XLSX 导入失败:', error);
    ElMessage.error('XLSX 文件解析失败: ' + error.message);
  } finally {
    isXlsxProcessing.value = false;
  }
};
</script>


<template>
  <div>
    <h3>搜索订单</h3>

    <el-form :inline="false" :model="searchQuery" class="search-form" label-width="100px">
      <!-- 第一行 -->
      <div class="form-row">
        <el-form-item label="订单ID" class="form-item">
          <el-input v-model="searchQuery.orderId" placeholder="输入订单ID"></el-input>
        </el-form-item>

        <el-form-item label="用户ID" class="form-item">
          <el-input v-model="searchQuery.userId" placeholder="输入用户ID"></el-input>
        </el-form-item>

        <el-form-item label="开始时间" class="form-item">
          <el-date-picker
            v-model="searchQuery.startTime"
            type="date"
            placeholder="选择开始日期"
            clearable
          ></el-date-picker>
        </el-form-item>

        <el-form-item label="结束时间" class="form-item">
          <el-date-picker
            v-model="searchQuery.endTime"
            type="date"
            placeholder="选择结束日期"
            clearable
          ></el-date-picker>
        </el-form-item>

        <el-form-item class="button-item">
          <el-button @click="fetchOrders">搜索</el-button>
        </el-form-item>
      </div>

      <!-- 第二行 -->
      <div class="form-row">
        <el-form-item label="订单号" class="form-item">
          <el-input v-model="searchQuery.orderNum" placeholder="输入订单号"></el-input>
        </el-form-item>

        <el-form-item label="状态" class="form-item">
          <el-select v-model="searchQuery.state" placeholder="选择状态" clearable @clear="resetState">
            <el-option
              v-for="option in stateOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <!-- <el-form-item label="客户类型" class="form-item" @clear="resetcustomerType">
          <el-select
            v-model="searchQuery.customerType"
            placeholder="选择客户类型"
            clearable
          >
            <el-option
              v-for="option in customerTypeOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item> -->

        <el-form-item label="场景" class="form-item">
          <el-select v-model="searchQuery.scene" placeholder="选择场景" clearable @clear="resetScene">
            <el-option
              v-for="option in sceneOptionsSearch"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>

        <!-- 占位的空白表单项，用于对齐 -->
        <el-form-item class="form-item" style="visibility: hidden;">
          <el-input></el-input>
        </el-form-item>

        <el-form-item class="button-item">
          <el-button @click="resetFilters">重置</el-button>
        </el-form-item>
      </div>

      <!-- 第三行 -->
      <div class="form-row">
        <el-form-item label="定时达地址" class="form-item">
          <el-select v-model="searchQuery.school" placeholder="选择定时达地址" clearable @clear="resetSchool">
            <el-option
              v-for="school in schoolOptions"
              :key="school"
              :label="school"
              :value="school"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="送达点" class="form-item">
          <el-select v-model="searchQuery.address" placeholder="选择送达点" clearable @clear="resetAddress">
            <el-option
              v-for="address in addressOptions"
              :key="address"
              :label="address"
              :value="address"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="定时达时间" class="form-item">
          <el-select v-model="searchQuery.time" placeholder="选择定时达时间" clearable @clear="resetTime">
            <el-option
              v-for="time in timeOptions"
              :key="time"
              :label="formatSendTime(time)"
              :value="time"
            />
          </el-select>
        </el-form-item>

        <!-- 占位的空白表单项，用于对齐 -->
        <el-form-item class="form-item" style="visibility: hidden;">
          <el-input></el-input>
        </el-form-item>

        <el-form-item class="button-item">
          <el-button type="primary" @click="openNewOrderDialog">新建订单</el-button>
        </el-form-item>
      </div>
    </el-form>

    <el-checkbox v-model="autoPrintDineInEnabled">自动打印堂食</el-checkbox>
    <el-checkbox v-model="autoPrintTakeOutEnabled">自动打印外带</el-checkbox>
    <el-checkbox v-model="autoPrintFixDeliverEnabled">自动打印定时达</el-checkbox>

    <h1>订单列表</h1>

    <div style="margin-bottom: 10px;">
      <!-- <el-button @click="selectAllOrders" size="small">全选</el-button>
      <el-button @click="deselectAllOrders" size="small" style="margin-left: 10px;">取消全选</el-button> -->
      <el-button @click="batchPrintOrders" size="small" type="success" :disabled="selectedOrders.length === 0">批量打印</el-button>
      <el-button @click="BatchSupplyOrders" size="small" type="primary" :disabled="selectedOrders.length === 0">批量供餐</el-button>
      <el-button @click="openBatchImportDialog" size="small" type="warning" style="margin-left: 10px;">批量导入订单</el-button>
    </div>
    

    <el-table :data="paginatedOrders" stripe @selection-change="handleSelectionChange"> 
      <el-table-column type="selection" width="55"></el-table-column>
      <el-table-column prop="orderNum" label="订单号" width="70" />
      <el-table-column prop="state" label="状态" width="80px" />
      <el-table-column label="商品" width="100px">
        <template #default="props">
          <div>
            <span v-for="(item, index) in props.row.items" :key="item.uuid">
              {{ item.name }}<span v-if="index < props.row.items.length - 1">, </span>
            </span>
          </div>
        </template>
      </el-table-column>
      <el-table-column label="总价" width="100px" >
        <template #default="{ row }">
          <div>
            <div>{{ row.totalPrice / 100 }}元</div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="remark" label="顾客备注" width="160px" />
      <el-table-column prop="scene" label="场景" width="70px" />

      <el-table-column prop="deliveryInfo.school" label="定时达地址" width="100px" />
      <el-table-column prop="deliveryInfo.address" label="送达点" width="120px" />
      <el-table-column label="定时达时间" width="160px">
        <template #default="props">
          {{ formatSendTime(props.row.deliveryInfo?.time) || '无' }}
        </template>
      </el-table-column>


      <el-table-column prop="createdAt" label="创建时间" width="170px" :formatter="showDate" />
      <el-table-column label="操作">
        <template #default="scope">
          <el-button
            v-if="scope.row.state === '待出餐' || scope.row.state === '待配送'"
            type="primary"
            size="small"
            @click="handleSupplyOrder(scope.row)"
          >
            供餐
          </el-button>
          <!-- Show the refund button only if the order is not already refunded -->
          <el-button 
            v-if="scope.row.state !== '已退款' && scope.row.state !== '预支付' && scope.row.state !== '已关单'"
            type="danger" 
            size="small" 
            @click="openRefundDialog(scope.row)"
          >
            退款
          </el-button>
          <el-button 
            type="info" 
            size="small" 
            @click="openOrderDetailsDialog(scope.row)"
          >
            详情
          </el-button>
          <el-button 
            type="success" 
            size="small" 
            @click="printOrder(scope.row)"
          >
            打印
          </el-button>
        </template>
      </el-table-column>

    </el-table>

    <!-- Order Details Dialog -->
    <el-dialog title="订单详情" v-model="orderDetailsDialogVisible" width="50%">
      <div v-if="selectedOrder" class="order-details">

        <!-- Basic Order Information -->
        <div class="order-section">
          <h4>基本信息</h4>
          <el-row :gutter="20">
            <el-col :span="12">
              <p><strong>订单Id:</strong> {{ selectedOrder.id }}</p>
              <p><strong>订单号:</strong> {{ selectedOrder.orderNum }}</p>
              <p><strong>状态:</strong> {{ selectedOrder.state }}</p>
              <p><strong>场景:</strong> {{ selectedOrder.scene }}</p>
              <p><strong>线下优惠:</strong> {{ selectedOrder.disPrice / 100 }}元</p>
              <p><strong>总价格:</strong> {{ selectedOrder.totalPrice / 100 }}元</p>
              <p v-if="selectedOrder.coupon">
                <strong>优惠券名称:</strong> {{ selectedOrder.coupon.name }}
              </p>
              <p v-if="selectedOrder.coupon">
                <strong>优惠券抵扣金额:</strong> {{ selectedOrder.coupon.dePrice / 100 }}元
              </p>
            </el-col>
            <el-col :span="12">
              <p><strong>用户Id:</strong> {{ selectedOrder.userId }}</p>
              <!-- <p><strong>客户类型:</strong> {{ selectedOrder.customerType }}</p> -->
              <p><strong>顾客备注:</strong> {{ selectedOrder.remark }}</p>
              <p><strong>商家备注:</strong> {{ selectedOrder.merchantNote }}</p>
              <p><strong>创建时间:</strong> {{ showDate(selectedOrder) }}</p>
            </el-col>
          </el-row>
        </div>

        <!-- Delivery Information -->
        <div v-if="selectedOrder.deliveryInfo" class="order-section">
          <h4>定时达配送信息</h4>
          <el-row :gutter="20">
            <el-col :span="12">
              <p><strong>学校:</strong> {{ selectedOrder.deliveryInfo.school }}</p>
            </el-col>
            <el-col :span="12">
              <p><strong>地址:</strong> {{ selectedOrder.deliveryInfo.address }}</p>
            </el-col>
            <el-col :span="12">
              <p><strong>时间:</strong> {{ formatSendTime(selectedOrder.deliveryInfo.time || '') }}</p>
            </el-col>
            <el-col :span="12">
              <p><strong>电话:</strong> {{ selectedOrder.deliveryInfo.number }}</p>
            </el-col>
          </el-row>
        </div>

        <!-- Order Items -->
        <div class="order-section">
          <h4>商品列表</h4>
          <el-row :gutter="20" v-for="(item, index) in selectedOrder.items" :key="index" class="order-item">
            <el-col :span="12">
              <p><strong>商品名称:</strong> {{ item.name }}</p>
              <p><strong>价格:</strong> {{ item.price / 100 }}元</p>
            </el-col>
            <el-col :span="12">
              <p><strong>选项:</strong></p>
              <ul>
                <li v-for="(optionValue, optionKey) in item.optionValues" :key="optionKey">
                  {{ optionKey }}: {{ optionValue.value }} (调整价: {{ optionValue.priceAdjustment / 100 }}元)
                </li>
              </ul>
            </el-col>
          </el-row>
        </div>
      </div>

      <template #footer>
        <el-button @click="orderDetailsDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- Refund Confirmation Dialog -->
    <el-dialog title="确认退款" v-model="refundDialogVisible">
      <span>请输入退款原因进行确认：</span>
      <el-input type="textarea" v-model="refundReason" placeholder="请输入退款原因，不可为空。"></el-input>
      <template #footer>
        <el-button @click="refundDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="confirmRefund">确认</el-button>
      </template>
    </el-dialog>

    <!-- 批量导入订单对话框 -->
    <el-dialog title="批量导入订单" v-model="batchImportDialogVisible" width="70%">
      <el-tabs type="border-card">
        <!-- JSON 导入选项卡 -->
        <el-tab-pane label="JSON 格式导入">
          <div style="margin-bottom: 20px;">
            <el-alert
              title="使用说明"
              type="info"
              :closable="false"
              show-icon
            >
              <template #default>
                <ol style="margin: 0; padding-left: 20px;">
                  <li>点击"下载模板"按钮获取 JSON 模板文件</li>
                  <li>按照模板格式填写订单数据（商品名必须与系统中的商品名完全一致）</li>
                  <li><strong>外带/堂食订单</strong>：使用 deliveryLocation 字段（会添加到备注中）</li>
                  <li><strong>定时达订单</strong>：scene 设为 "定时达"，必须填写 deliveryInfo（school, address, time, number）</li>
                  <li>支持的选项包括：温度（热/冰/少冰）、糖度、杯型等，根据实际商品配置</li>
                  <li>将编辑好的 JSON 粘贴到下方文本框，点击"开始导入"</li>
                </ol>
              </template>
            </el-alert>
            <el-button 
              type="primary" 
              @click="downloadTemplate" 
              style="margin-top: 10px;"
              icon="Download"
            >
              下载 JSON 模板
            </el-button>
          </div>

          <el-form-item label="JSON 数据">
            <el-input
              v-model="batchImportJson"
              type="textarea"
              :rows="15"
              placeholder='粘贴 JSON 数据，格式参考模板'
            ></el-input>
          </el-form-item>

          <div v-if="batchImportTotal > 0" style="margin-top: 20px;">
            <el-progress 
              :percentage="Math.round((batchImportProgress / batchImportTotal) * 100)"
              :status="batchImportProgress === batchImportTotal ? 'success' : undefined"
            ></el-progress>
            <p style="margin-top: 10px;">
              进度: {{ batchImportProgress }} / {{ batchImportTotal }}
            </p>
          </div>

          <div v-if="batchImportResults.length > 0" style="margin-top: 20px; max-height: 300px; overflow-y: auto;">
            <h4>导入结果：</h4>
            <el-alert
              v-for="(result, index) in batchImportResults"
              :key="index"
              :title="result.message"
              :type="result.success ? 'success' : 'error'"
              :closable="false"
              style="margin-bottom: 10px;"
            >
              <template #default v-if="result.orderData">
                <div style="font-size: 12px;">
                  <div>场景: {{ result.orderData.scene }}</div>
                  <div>商品: {{ result.orderData.items?.map((i: any) => i.productName).join(', ') }}</div>
                </div>
              </template>
            </el-alert>
          </div>

          <div style="margin-top: 20px; text-align: right;">
            <el-button 
              type="primary" 
              @click="processBatchImport"
              :disabled="!batchImportJson || batchImportProgress > 0"
            >
              开始导入 JSON
            </el-button>
          </div>
        </el-tab-pane>

        <!-- XLSX 导入选项卡 -->
        <el-tab-pane label="XLSX 文件导入（定时达订单）">
          <div style="margin-bottom: 20px;">
            <el-alert
              title="使用说明"
              type="warning"
              :closable="false"
              show-icon
            >
              <template #default>
                <ol style="margin: 0; padding-left: 20px;">
                  <li><strong>仅支持导入“定时达”订单</strong>，系统会使用当前登录账号自动下单。</li>
                  <li><strong>XLSX 列顺序要求</strong>
                    <ul style="margin-top: 5px;">
                      <li><strong>第 1 - 3 列</strong>（编号、提交人、提交时间）可留空，系统忽略。</li>
                      <li><strong>第 4 列：定时达地点</strong><br>
                        推荐格式 <code>学校：收货位置</code>，例如 <code>北大：二教</code>、<code>清华园：紫八三单元</code>。
                      </li>
                      <li><strong>第 5 列：补充地点</strong><br>
                        可填写更详细的送达描述（门牌、楼层等），留空则仅使用第 4 列信息。
                      </li>
                      <li><strong>第 6 列：定时达时间</strong><br>
                        支持 <code>2025-11-22 10:00</code>、<code>2025-11-22 10：00</code>（中文冒号）或 Excel 日期时间单元格。
                      </li>
                      <li><strong>第 7 列：饮品信息</strong><br>
                        示例：<code>【特调】围炉夜话：11.7r</code>；多杯可用中文顿号、逗号或竖线分隔：<code>【巴斯克】栗子：18r, 【美式】玫瑰：13.5r</code>。<br>
                        系统会提取 “】” 与 “：” 之间的文字作为商品名称。
                      </li>
                      <li><strong>第 8 列：冰 / 热</strong><br>
                        自动识别 <code>冰</code>、<code>热</code>、<code>常温</code> 等关键词，例如 <code>冰的！</code>、<code>热的！</code>、<code>常温</code>。
                      </li>
                      <li><strong>第 9 列：是否换燕麦奶</strong><br>
                        包含 “换 / 要 / 加” 视为需要燕麦奶，包含 “不 / 无 / 否” 视为不更换，留空默认不更换。
                      </li>
                      <li><strong>第 10 列：付款手机号备注</strong><br>
                        当前版本仅做记录，不会回写到订单，可以留空。
                      </li>
                    </ul>
                  </li>
                  <li><strong>重要提示：</strong>
                    <ul style="margin-top: 5px;">
                      <li>饮品名称必须与系统中的商品名称<strong>完全一致</strong>。</li>
                      <li>温度、燕麦奶等选项由系统自动匹配，若找不到对应选项将导致导入失败。</li>
                      <li>支持一行多杯，每杯可以是不同商品。</li>
                    </ul>
                  </li>
                  <li>选择 XLSX 文件后，点击“开始导入 XLSX”。</li>
                </ol>
              </template>
            </el-alert>
          </div>

          <el-form-item label="选择 XLSX 文件">
            <input 
              type="file" 
              accept=".xlsx,.xls" 
              @change="handleXlsxFileChange"
              style="margin-bottom: 10px;"
            />
            <div v-if="xlsxFile" style="color: #67c23a; margin-top: 5px;">
              已选择：{{ xlsxFile.name }}
            </div>
          </el-form-item>

          <div v-if="xlsxImportTotal > 0" style="margin-top: 20px;">
            <el-progress 
              :percentage="Math.round((xlsxImportProgress / xlsxImportTotal) * 100)"
              :status="xlsxImportProgress === xlsxImportTotal ? 'success' : undefined"
            ></el-progress>
            <p style="margin-top: 10px;">
              进度: {{ xlsxImportProgress }} / {{ xlsxImportTotal }}
            </p>
          </div>

          <div v-if="xlsxImportResults.length > 0" style="margin-top: 20px; max-height: 300px; overflow-y: auto;">
            <h4>导入结果：</h4>
            <el-alert
              v-for="(result, index) in xlsxImportResults"
              :key="index"
              :title="result.message"
              :type="result.success ? 'success' : 'error'"
              :closable="false"
              style="margin-bottom: 10px;"
            >
              <template #default v-if="result.orderData">
                <div style="font-size: 12px;">
                  <div v-if="result.orderData.locationStr">地点: {{ result.orderData.locationStr }}</div>
                  <div v-if="result.orderData.drinkStr">饮品: {{ result.orderData.drinkStr }}</div>
                  <div v-if="result.orderData.productNames">解析出: {{ result.orderData.productNames.join(', ') }}</div>
                </div>
              </template>
            </el-alert>
          </div>

          <div style="margin-top: 20px; text-align: right;">
            <el-button 
              type="primary" 
              @click="processXlsxImport"
              :disabled="!xlsxFile || isXlsxProcessing"
            >
              开始导入 XLSX
            </el-button>
          </div>
        </el-tab-pane>
      </el-tabs>

      <template #footer>
        <el-button @click="batchImportDialogVisible = false">关闭</el-button>
      </template>
    </el-dialog>

    <!-- 分页组件 -->
    <el-pagination
      v-model:current-page="currentPage"
      :page-size="pageSize"
      :total="filteredOrders.length"
      layout="prev, pager, next, jumper, ->, total"
      style="margin-top: 20px; text-align: right;"
    />

    <!-- 新建订单对话框 -->
    <el-dialog title="新建订单" v-model="newOrderDialogVisible" width="60%">
      <el-form :model="newOrderForm" label-width="120px">
        <!-- 产品选择部分 -->
        <el-form-item label="商品">
          <el-button type="primary" @click="addProduct">添加商品</el-button>
        </el-form-item>

        <!-- 动态添加的商品列表 -->
        <div
          v-for="(product, index) in newOrderForm.products"
          :key="index"
          class="product-item"
        >
          <el-row :gutter="20" align="middle">
            <el-col :span="7">
              <el-form-item label="选择商品">
                <el-select
                  v-model="product.productId"
                  filterable
                  remote
                  :remote-method="fetchProductOptions"
                  placeholder="请选择商品"
                  @change="handleProductChange(product)"
                  style="width: 150px;"
                >
                  <el-option
                    v-for="item in productOptionsList"
                    :key="item.id"
                    :label="item.name"
                    :value="item.id"
                  />
                </el-select>
              </el-form-item>
              <el-form-item v-if="product.price !== null" label="商品基础价格">
                <span>{{ product.price / 100 }} 元</span>
              </el-form-item>
            </el-col>
            <el-col :span="12">
              <el-form-item label="选择选项">
                <div
                  v-for="(options, key) in product.availableOptions"
                  :key="key"
                  class="option-group"
                  style="width: 100%;"
                >
                  <span>{{ key }}:</span>
                  <el-radio-group v-model="product.selectedOptions[key]">
                    <el-radio v-for="option in options" :key="option.value" :label="option.uuid">
                      {{ option.value }}
                      ({{ option.priceAdjustment ? '+' + option.priceAdjustment / 100 + '元' : '+0元' }})
                    </el-radio>
                  </el-radio-group>
                </div>
              </el-form-item>
            </el-col>
            <el-col :span="4">
              <el-form-item>
                <el-button type="danger" @click="removeProduct(index)">删除</el-button>
              </el-form-item>
            </el-col>
          </el-row>
        </div>

        <!-- 场景选择 -->
        <el-form-item label="场景">
          <el-select v-model="newOrderForm.scene" placeholder="选择场景" clearable style="width: 150px;">
            <el-option
              v-for="option in sceneOptions"
              :key="option.value"
              :label="option.label"
              :value="option.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="优惠金额">
          <el-input-number v-model="newOrderForm.disPrice" :min="0" placeholder="输入优惠金额（元）"></el-input-number>
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="newOrderDialogVisible = false">取消</el-button>
        <el-button type="primary" @click="submitNewOrder">提交</el-button>
      </template>
    </el-dialog>
  </div>
</template>


<style scoped>
.search-form {
  margin-bottom: 20px;
}

.form-row {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
  margin-bottom: 10px;
}

.form-row .el-form-item {
  flex: 1;
  min-width: 200px;
}

.product-item {
  border: 1px solid #ebeef5;
  padding: 20px;
  margin-bottom: 20px;
  border-radius: 4px;
  background-color: #f9f9f9;
}

.option-group {
  margin-bottom: 10px;
}

.order-details {
  font-size: 14px;
}

.order-section {
  padding: 15px;
  margin-bottom: 5px;
  border-radius: 8px;
  background-color: #f5f7fa;
  border: 1px solid #ebeef5;
}

.order-section h4 {
  font-size: 16px;
  color: #409EFF;
  margin-bottom: 5px;
}

.order-item {
  padding: 5px;
  border-bottom: 1px solid #ebeef5;
}

.order-item:last-child {
  border-bottom: none;
}

.order-item p {
  margin: 5px 0;
}

ul {
  list-style-type: none;
  padding-left: 0;
}

.order-section .el-col {
  padding-bottom: 5px;
}

.search-form {
  margin-bottom: 20px;
}

.form-row {
  display: flex;
  align-items: flex-end; /* 使元素底部对齐 */
  gap: 20px;
}

.form-item {
  width: 250px; /* 设置统一的宽度 */
}

.button-item {
  margin-left: auto; /* 将按钮推到最右边 */
}


</style>




