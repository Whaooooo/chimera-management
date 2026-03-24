<template>
    <el-container>
      <el-header>
        <el-button type="primary" @click="openAddDialog">新增配置</el-button>
      </el-header>
  
      <el-main>
        <el-table :data="configurations" style="width: 100%">
          <el-table-column prop="key" label="配置项键名" />
          <el-table-column label="配置项值">
            <template #default="{ row }">
              <span v-if="isBusinessHoursKey(row.key)" class="business-hours-value">
                {{ formatBusinessHoursForDisplay(row.value) }}
              </span>
              <span v-else>{{ row.value }}</span>
            </template>
          </el-table-column>
          <el-table-column prop="description" label="描述" />
          <el-table-column prop="category" label="类别" />
          <el-table-column label="操作" width="200">
            <template #default="scope">
              <el-button size="small" @click="openEditDialog(scope.row)">编辑</el-button>
              <el-button size="small" type="danger" @click="handleDeleteConfiguration(scope.row.id)">删除</el-button>
            </template>
          </el-table-column>
        </el-table>
      </el-main>
  
      <!-- 添加/编辑对话框 -->
      <el-dialog :title="isEditing ? '编辑配置' : '新增配置'" v-model="dialogVisible" width="600px">
        <el-form :model="currentConfig" :rules="rules" ref="configForm" label-width="100px">
          <el-form-item label="键名" prop="key">
            <el-input v-model="currentConfig.key" :disabled="isEditing" placeholder="例如: weekdays_opening_hours" />
          </el-form-item>
          
          <!-- 普通值输入 -->
          <el-form-item v-if="!isBusinessHoursKey(currentConfig.key)" label="值" prop="value">
            <el-input v-model="currentConfig.value" placeholder="配置值" />
          </el-form-item>
          
          <!-- 营业时间专用编辑器 -->
          <el-form-item v-else label="营业时间" prop="value">
            <div class="business-hours-editor">
              <div class="segments-list">
                <div v-for="(segment, index) in businessHoursSegments" :key="index" class="segment-row">
                  <el-time-picker
                    v-model="segment.startTime"
                    format="HH:mm"
                    value-format="HH:mm"
                    placeholder="开始时间"
                    style="width: 120px"
                  />
                  <span class="segment-separator">至</span>
                  <el-time-picker
                    v-model="segment.endTime"
                    format="HH:mm"
                    value-format="HH:mm"
                    placeholder="结束时间"
                    style="width: 120px"
                  />
                  <el-button type="danger" link size="small" @click="removeBusinessHoursSegment(index)">
                    <el-icon><Delete /></el-icon>
                  </el-button>
                </div>
              </div>
              <el-button type="primary" plain size="small" @click="addBusinessHoursSegment" class="add-segment-btn">
                + 添加时间段
              </el-button>
              <div class="business-hours-preview">
                <span class="preview-label">预览：</span>
                <span class="preview-value">{{ businessHoursPreview || '未设置' }}</span>
              </div>
              <div v-if="businessHoursError" class="business-hours-error">
                {{ businessHoursError }}
              </div>
            </div>
          </el-form-item>
          
          <el-form-item label="描述" prop="description">
            <el-input v-model="currentConfig.description" placeholder="配置描述" />
          </el-form-item>
          <el-form-item label="类别" prop="category">
            <el-input v-model="currentConfig.category" placeholder="配置类别" />
          </el-form-item>
        </el-form>
  
        <template #footer>
          <el-button @click="dialogVisible = false">取消</el-button>
          <el-button type="primary" @click="submitForm" :disabled="!!businessHoursError">确定</el-button>
        </template>
      </el-dialog>
    </el-container>
</template>
  
<script setup lang="ts">
  import { ref, onMounted, computed, watch } from 'vue';
  import { ElMessage, type FormInstance } from 'element-plus';
  import { Delete } from '@element-plus/icons-vue';
  import { addConfiguration, deleteConfiguration, getAllAppConfigurations, updateConfiguration, type AppConfiguration, type GetAllAppConfigurationsResponse } from '@/client';
  
  const configurations = ref<AppConfiguration[]>([]);
  const dialogVisible = ref(false);
  const isEditing = ref(false);
  const currentConfig = ref<AppConfiguration>({
    id: '',
    key: '',
    value: '',
    description: '',
    category: '',
  });
  
  // 营业时间时间段
  interface TimeSegment {
    startTime: string;
    endTime: string;
  }
  
  const businessHoursSegments = ref<TimeSegment[]>([]);
  const businessHoursError = ref('');
  
  // 是否是营业时间配置键
  const isBusinessHoursKey = (key: string): boolean => {
    return key === 'weekdays_opening_hours' || key === 'weekend_opening_hours';
  };
  
  // 解析营业时间字符串为时间段
  const parseBusinessHours = (value: string): TimeSegment[] => {
    if (!value) return [];
    const segments: TimeSegment[] = [];
    const parts = value.split(',');
    for (const part of parts) {
      const trimmed = part.trim();
      if (!trimmed) continue;
      const [start, end] = trimmed.split('-');
      if (start && end) {
        segments.push({
          startTime: start.trim(),
          endTime: end.trim()
        });
      }
    }
    return segments.length > 0 ? segments : [{ startTime: '', endTime: '' }];
  };
  
  // 将时间段格式化为营业时间字符串
  const formatBusinessHours = (segments: TimeSegment[]): string => {
    const validSegments = segments.filter(s => s.startTime && s.endTime);
    if (validSegments.length === 0) return '';
    return validSegments.map(s => `${s.startTime}-${s.endTime}`).join(',');
  };
  
  // 营业时间预览
  const businessHoursPreview = computed(() => {
    return formatBusinessHoursForDisplay(formatBusinessHours(businessHoursSegments.value));
  });
  
  // 验证营业时间
  const validateBusinessHours = () => {
    businessHoursError.value = '';
    
    const segments = businessHoursSegments.value.filter(s => s.startTime && s.endTime);
    if (segments.length === 0) {
      businessHoursError.value = '至少需要一个有效的时间段';
      return;
    }
    
    // 验证每个时间段
    for (const segment of segments) {
      if (segment.startTime >= segment.endTime) {
        businessHoursError.value = `时间段 ${segment.startTime}-${segment.endTime} 中，开始时间必须早于结束时间`;
        return;
      }
    }
    
    // 验证时间段不重叠
    const timeRanges = segments.map(s => ({
      start: parseTimeToMinutes(s.startTime),
      end: parseTimeToMinutes(s.endTime)
    }));
    
    for (let i = 0; i < timeRanges.length; i++) {
      for (let j = i + 1; j < timeRanges.length; j++) {
        if (timeRangesOverlap(timeRanges[i].start, timeRanges[i].end, timeRanges[j].start, timeRanges[j].end)) {
          businessHoursError.value = `时间段 ${segments[i].startTime}-${segments[i].endTime} 与 ${segments[j].startTime}-${segments[j].endTime} 有重叠`;
          return;
        }
      }
    }
  };
  
  const parseTimeToMinutes = (time: string): number => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
  };
  
  const timeRangesOverlap = (start1: number, end1: number, start2: number, end2: number): boolean => {
    return start1 < end2 && start2 < end1;
  };
  
  // 格式化营业时间用于显示
  const formatBusinessHoursForDisplay = (value: string): string => {
    if (!value) return '未设置';
    const segments = value.split(',');
    if (segments.length === 1) return segments[0];
    return segments.map(s => s.trim()).join(' | ');
  };
  
  // 添加时间段
  const addBusinessHoursSegment = () => {
    businessHoursSegments.value.push({ startTime: '', endTime: '' });
  };
  
  // 删除时间段
  const removeBusinessHoursSegment = (index: number) => {
    businessHoursSegments.value.splice(index, 1);
    if (businessHoursSegments.value.length === 0) {
      addBusinessHoursSegment();
    }
    validateBusinessHours();
  };
  
  // 监听时间段变化
  watch(businessHoursSegments, () => {
    validateBusinessHours();
    if (isBusinessHoursKey(currentConfig.value.key)) {
      currentConfig.value.value = formatBusinessHours(businessHoursSegments.value);
    }
  }, { deep: true });
  
  // 监听键名变化，初始化时间段
  watch(() => currentConfig.value.key, (newKey) => {
    if (isBusinessHoursKey(newKey) && !isEditing.value) {
      // 新增时，默认给一个空时间段
      businessHoursSegments.value = [{ startTime: '', endTime: '' }];
    }
  });
  
  const rules = {
    key: [{ required: true, message: '请输入配置键名', trigger: 'blur' }],
    value: [{ required: true, message: '请输入配置值', trigger: 'blur' }],
  };
  
  const configForm = ref<FormInstance>();
  
  const fetchConfigurations = async () => {
    try {
      const response = await getAllAppConfigurations();
      configurations.value = response.data as GetAllAppConfigurationsResponse;
    } catch (error) {
      ElMessage.error('获取配置失败');
    }
  };
  
  const openAddDialog = () => {
    isEditing.value = false;
    currentConfig.value = { id: '', key: '', value: '', description: '', category: '' };
    businessHoursSegments.value = [{ startTime: '', endTime: '' }];
    businessHoursError.value = '';
    dialogVisible.value = true;
  };
  
  const openEditDialog = (config: AppConfiguration) => {
    isEditing.value = true;
    currentConfig.value = { ...config };
    businessHoursError.value = '';
    
    if (isBusinessHoursKey(config.key)) {
      businessHoursSegments.value = parseBusinessHours(config.value);
    } else {
      businessHoursSegments.value = [{ startTime: '', endTime: '' }];
    }
    
    dialogVisible.value = true;
  };
  
  const submitForm = () => {
    configForm.value?.validate(async (valid: boolean) => {
      if (!valid) return;
      
      if (isBusinessHoursKey(currentConfig.value.key) && businessHoursError.value) {
        ElMessage.error(businessHoursError.value);
        return;
      }
      
      if (isEditing.value) {
        await handleUpdateConfiguration();
      } else {
        await handleAddConfiguration();
      }
      dialogVisible.value = false;
      fetchConfigurations();
    });
  };
  
  const handleAddConfiguration = async () => {
    try {
      await addConfiguration({ body: currentConfig.value });
      ElMessage.success('新增配置成功');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || '新增配置失败';
      ElMessage.error(errorMsg);
    }
  };
  
  const handleUpdateConfiguration = async () => {
    try {
      await updateConfiguration({ body: currentConfig.value });
      ElMessage.success('修改配置成功');
    } catch (error: any) {
      const errorMsg = error?.response?.data?.error || '修改配置失败';
      ElMessage.error(errorMsg);
    }
  };
  
  const handleDeleteConfiguration = async (id: string) => {
    try {
      await deleteConfiguration({ path: { id: id } });
      ElMessage.success('删除配置成功');
      fetchConfigurations();
    } catch (error) {
      ElMessage.error('删除配置失败');
    }
  };
  
  onMounted(() => {
    fetchConfigurations();
  });
</script>
  
<style scoped>
  .el-table {
    margin-top: 20px;
  }
  
  .business-hours-value {
    font-family: monospace;
    background-color: #f5f7fa;
    padding: 2px 6px;
    border-radius: 4px;
    color: #409eff;
  }
  
  .business-hours-editor {
    border: 1px solid #dcdfe6;
    border-radius: 4px;
    padding: 16px;
    background-color: #fafafa;
  }
  
  .segments-list {
    margin-bottom: 12px;
  }
  
  .segment-row {
    display: flex;
    align-items: center;
    margin-bottom: 8px;
    gap: 8px;
  }
  
  .segment-separator {
    color: #606266;
    font-size: 14px;
  }
  
  .add-segment-btn {
    margin-bottom: 12px;
  }
  
  .business-hours-preview {
    padding: 8px 12px;
    background-color: #ecf5ff;
    border-radius: 4px;
    border-left: 4px solid #409eff;
  }
  
  .preview-label {
    color: #606266;
    font-size: 13px;
  }
  
  .preview-value {
    color: #409eff;
    font-weight: 500;
    font-family: monospace;
  }
  
  .business-hours-error {
    margin-top: 8px;
    padding: 8px 12px;
    background-color: #fef0f0;
    color: #f56c6c;
    border-radius: 4px;
    font-size: 13px;
  }
</style>
