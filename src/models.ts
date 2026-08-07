import type { Model, Env, Provider } from './types'
import { getProviders, setProviders } from './storage'

/**
 * 模型智能自动分类
 * 根据模型名称关键词自动标记类型：文本 / 绘图 / 多模态 / 其他
 */
export function autoClassifyModel(modelId: string): '文本' | '绘图' | '多模态' | '其他' {
  if (!modelId) return '其他'
  const name = modelId.toLowerCase()

  // 绘图关键词
  if (
    name.includes('dall-e') ||
    name.includes('midjourney') ||
    name.includes('stable-diffusion') ||
    name.includes('flux') ||
    name.includes('imagen') ||
    name.includes('cogview') ||
    name.includes('playground') ||
    name.includes('sdxl') ||
    name.includes('image') ||
    name.includes('绘图') ||
    name.includes('draw') ||
    name.includes('paint')
  ) {
    return '绘图'
  }

  // 多模态关键词
  if (
    name.includes('vision') ||
    name.includes('vl') ||
    name.includes('omni') ||
    name.includes('4o') ||
    name.includes('gemini-1.5') ||
    name.includes('gemini-2.0') ||
    name.includes('claude-3-5') ||
    name.includes('claude-3-7') ||
    name.includes('claude-3') ||
    name.includes('multimodal') ||
    name.includes('多模态') ||
    name.includes('audio') ||
    name.includes('speech') ||
    name.includes('realtime')
  ) {
    return '多模态'
  }

  // 文本关键词
  if (
    name.includes('gpt') ||
    name.includes('deepseek') ||
    name.includes('qwen') ||
    name.includes('claude') ||
    name.includes('llama') ||
    name.includes('mistral') ||
    name.includes('gemma') ||
    name.includes('chat') ||
    name.includes('text') ||
    name.includes('coder') ||
    name.includes('r1') ||
    name.includes('v3') ||
    name.includes('command')
  ) {
    return '文本'
  }

  return '其他'
}

/**
 * 识别模型是否适合长文本 / 超长 Prompt (如 >16k/32k/128k/200k 上下文)
 * 用于应对复杂 Prompt、大任务拆解、长上下文阅读等场景
 */
export function isLongContextModel(modelId: string): boolean {
  if (!modelId) return false
  const id = modelId.toLowerCase()

  // 1. 明确排除非长文本/专用非对话模型（如纯 OCR、Embedding、语音、绘图等）
  if (
    id.includes('ocr') ||
    id.includes('embed') ||
    id.includes('rerank') ||
    id.includes('whisper') ||
    id.includes('tts') ||
    id.includes('speech') ||
    id.includes('dall-e') ||
    id.includes('sdxl') ||
    id.includes('flux')
  ) {
    return false
  }

  // 2. 具备大 Context 或高性能长 Prompt 特征的关键词
  if (
    id.includes('flash') ||
    id.includes('pro') ||
    id.includes('long') ||
    id.includes('32k') ||
    id.includes('64k') ||
    id.includes('128k') ||
    id.includes('200k') ||
    id.includes('256k') ||
    id.includes('1m') ||
    id.includes('claude-3') ||
    id.includes('deepseek-chat') ||
    id.includes('deepseek-reasoner') ||
    id.includes('qwen2.5') ||
    id.includes('qwen-max') ||
    id.includes('qwen-plus') ||
    id.includes('intern-s2') ||
    id.includes('intern-s1') ||
    id.includes('seed-oss') ||
    id.includes('gemini-1.5') ||
    id.includes('gemini-2') ||
    id.includes('gpt-4o') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('agnes') ||
    id.includes('latest')
  ) {
    return true
  }

  // 默认：常规通用文本/多模态大模型大多支持较长的上下文
  return false
}

/**
 * 识别模型是否为文本/通用语言对话模型
 */
export function isTextModel(modelId: string): boolean {
  if (!modelId) return false
  const id = modelId.toLowerCase()

  // 1. 明确排除非对话/文本生成专用模型（如纯 OCR、Embedding、重排、语音、绘图等）
  if (
    id.includes('embed') ||
    id.includes('rerank') ||
    id.includes('whisper') ||
    id.includes('tts') ||
    id.includes('speech') ||
    id.includes('dall-e') ||
    id.includes('sdxl') ||
    id.includes('flux') ||
    id.includes('midjourney') ||
    id.includes('stable-diffusion') ||
    id.includes('imagen') ||
    id.includes('ocr') ||
    id.includes('moderation')
  ) {
    return false
  }

  // 2. 智能分类判断
  const category = autoClassifyModel(modelId)
  if (category === '文本' || category === '多模态') {
    return true
  }

  // 3. 通用文本对话特征词
  if (
    id.includes('gpt') ||
    id.includes('claude') ||
    id.includes('deepseek') ||
    id.includes('qwen') ||
    id.includes('gemini') ||
    id.includes('llama') ||
    id.includes('mistral') ||
    id.includes('gemma') ||
    id.includes('chat') ||
    id.includes('instruct') ||
    id.includes('coder') ||
    id.includes('reasoner') ||
    id.includes('r1') ||
    id.includes('v3') ||
    id.includes('o1') ||
    id.includes('o3') ||
    id.includes('pro') ||
    id.includes('flash') ||
    id.includes('command') ||
    id.includes('yi-') ||
    id.includes('baichuan') ||
    id.includes('hunyuan') ||
    id.includes('intern') ||
    id.includes('seed-oss') ||
    id.includes('agnes') ||
    id.includes('latest')
  ) {
    return true
  }

  return false
}

/**
 * 同一个提供商下模型 ID 不可重复，规范化并自动剔除重复模型
 */
export function deduplicateAndClassifyModels(modelsInput: unknown): Model[] {
  if (!Array.isArray(modelsInput)) return []
  const result: Model[] = []
  const seenIds = new Set<string>()

  for (const item of modelsInput) {
    if (!item) continue
    let id = ''
    let enabled = true
    let category: string | undefined = undefined
    let isLongContext: boolean | undefined = undefined
    let failureCount = 0
    let cooldownUntil: number | null = null
    let permanentlyDisabled = false
    let disabledReason: string | null = null

    if (typeof item === 'string') {
      id = item.trim()
    } else if (typeof item === 'object') {
      const obj = item as Record<string, unknown>
      id = String(obj.id || '').trim()
      enabled = obj.enabled !== undefined ? !!obj.enabled : true
      if (typeof obj.category === 'string' && obj.category) {
        category = obj.category
      }
      if (typeof obj.isLongContext === 'boolean') {
        isLongContext = obj.isLongContext
      }
      if (typeof obj.failureCount === 'number') {
        failureCount = obj.failureCount
      }
      if (typeof obj.cooldownUntil === 'number') {
        cooldownUntil = obj.cooldownUntil
      }
      if (typeof obj.permanentlyDisabled === 'boolean') {
        permanentlyDisabled = obj.permanentlyDisabled
      }
      if (typeof obj.disabledReason === 'string') {
        disabledReason = obj.disabledReason
      }
    }

    if (!id || seenIds.has(id)) continue
    seenIds.add(id)

    result.push({
      id,
      enabled,
      category: category || autoClassifyModel(id),
      isLongContext: isLongContext !== undefined ? isLongContext : isLongContextModel(id),
      failureCount,
      cooldownUntil,
      permanentlyDisabled,
      disabledReason,
    })
  }

  return result
}

/**
 * 一键重置全局冷却模型
 * 只清除冷却状态 (cooldownUntil = null)，不修改永久失效标记 (permanentlyDisabled)，不清空失败计数 (failureCount)
 */
export async function resetAllCooldowns(env: Env): Promise<{ resetCount: number }> {
  const providers = await getProviders(env)
  let resetCount = 0

  const updatedProviders = providers.map((provider) => {
    let providerChanged = false
    const updatedModels = provider.models.map((model) => {
      if (model.cooldownUntil) {
        resetCount++
        providerChanged = true
        return {
          ...model,
          cooldownUntil: null, // 仅清除冷却状态
        }
      }
      return model
    })

    if (providerChanged) {
      return {
        ...provider,
        models: updatedModels,
        updatedAt: new Date().toISOString(),
      }
    }
    return provider
  })

  if (resetCount > 0) {
    await setProviders(env, updatedProviders)
  }

  return { resetCount }
}

/**
 * 识别上游返回的永久失效故障
 * 支持包含：模型不存在、已下架、余额不足/欠费
 */
export function detectPermanentFailure(status: number, errorMsg: string): string | null {
  if (!errorMsg) return null
  const lower = errorMsg.toLowerCase()

  // 1. 模型不存在 / 下架
  if (
    lower.includes('model_not_found') ||
    lower.includes('does not exist') ||
    lower.includes('not_supported') ||
    lower.includes('invalid_model') ||
    lower.includes('model_sunset') ||
    lower.includes('decommissioned') ||
    lower.includes('deprecated') ||
    lower.includes('模型不存在') ||
    lower.includes('已下架') ||
    lower.includes('模型已下架') ||
    (status === 404 && (lower.includes('model') || lower.includes('not found') || lower.includes('不存在')))
  ) {
    return '模型不存在或已下架'
  }

  // 2. 余额不足 / 欠费
  if (
    lower.includes('insufficient_quota') ||
    lower.includes('insufficient_balance') ||
    lower.includes('quota_exceeded') ||
    lower.includes('out_of_credits') ||
    lower.includes('account_deactivated') ||
    lower.includes('billing') ||
    lower.includes('余额不足') ||
    lower.includes('欠费') ||
    lower.includes('点数不足') ||
    (status === 402 || (status === 429 && (lower.includes('quota') || lower.includes('balance') || lower.includes('insufficient'))))
  ) {
    return '账号余额不足或额度超限'
  }

  return null
}

/**
 * 一键批量选拔并启用所有适合长文本 / 大 Prompt 的高容量模型
 */
export async function batchEnableLongContextModels(env: Env): Promise<{ enabledCount: number; models: string[] }> {
  const providers = await getProviders(env)
  let enabledCount = 0
  const enabledModels: string[] = []

  const updatedProviders = providers.map((provider) => {
    let providerChanged = false
    const updatedModels = provider.models.map((model) => {
      const isLong = isLongContextModel(model.id)
      if (isLong && (!model.enabled || model.permanentlyDisabled)) {
        enabledCount++
        enabledModels.push(`${provider.id}/${model.id}`)
        providerChanged = true
        return {
          ...model,
          enabled: true,
          permanentlyDisabled: false,
          disabledReason: null,
          cooldownUntil: null,
          isLongContext: true,
        }
      }
      return {
        ...model,
        isLongContext: isLong,
      }
    })

    if (providerChanged) {
      return {
        ...provider,
        models: updatedModels,
        updatedAt: new Date().toISOString(),
      }
    }
    return provider
  })

  if (enabledCount > 0) {
    await setProviders(env, updatedProviders)
  }

  return { enabledCount, models: enabledModels }
}

/**
 * 一键批量选拔并启用所有标准文本 / 对话模型
 */
export async function batchEnableTextModels(env: Env): Promise<{ enabledCount: number; models: string[] }> {
  const providers = await getProviders(env)
  let enabledCount = 0
  const enabledModels: string[] = []

  const updatedProviders = providers.map((provider) => {
    let providerChanged = false
    const updatedModels = provider.models.map((model) => {
      const isTxt = isTextModel(model.id)
      if (isTxt && (!model.enabled || model.permanentlyDisabled)) {
        enabledCount++
        enabledModels.push(`${provider.id}/${model.id}`)
        providerChanged = true
        return {
          ...model,
          enabled: true,
          permanentlyDisabled: false,
          disabledReason: null,
          cooldownUntil: null,
        }
      }
      return model
    })

    if (providerChanged) {
      return {
        ...provider,
        models: updatedModels,
        updatedAt: new Date().toISOString(),
      }
    }
    return provider
  })

  if (enabledCount > 0) {
    await setProviders(env, updatedProviders)
  }

  return { enabledCount, models: enabledModels }
}

