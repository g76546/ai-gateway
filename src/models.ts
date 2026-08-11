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
    let failureCount = 0
    let cooldownUntil: number | null = null
    let permanentlyDisabled = false
    let disabledReason: string | null = null
    let lastPermTestAt: number | undefined = undefined
    let permTestFailCount: number | undefined = undefined

    if (typeof item === 'string') {
      id = item.trim()
    } else if (typeof item === 'object') {
      const obj = item as Record<string, unknown>
      id = String(obj.id || '').trim()
      enabled = obj.enabled !== undefined ? !!obj.enabled : true
      if (typeof obj.category === 'string' && obj.category) {
        category = obj.category
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
      if (typeof obj.lastPermTestAt === 'number') {
        lastPermTestAt = obj.lastPermTestAt
      }
      if (typeof obj.permTestFailCount === 'number') {
        permTestFailCount = obj.permTestFailCount
      }
    }

    if (!id || seenIds.has(id)) continue
    seenIds.add(id)

    result.push({
      id,
      enabled,
      category: category || autoClassifyModel(id),
      failureCount,
      cooldownUntil,
      permanentlyDisabled,
      disabledReason,
      lastPermTestAt,
      permTestFailCount,
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
