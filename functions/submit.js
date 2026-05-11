// Cloudflare Pages Function — GrowthCore 表单代理
// 路径: functions/submit.js → 处理 POST /submit

export async function onRequestPost(context) {
  const { request, env } = context;

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  try {
    const formData = await request.json();
    const token = await getTenantToken(env);
    const rawFields = mapFields(formData);

    // 过滤 null / undefined / 空字符串 / 空数组
    const fields = {};
    for (const k in rawFields) {
      const v = rawFields[k];
      if (v === null || v === undefined || v === '') continue;
      if (Array.isArray(v) && v.length === 0) continue;
      fields[k] = v;
    }

    const apiRes = await fetch(
      `https://open.feishu.cn/open-apis/bitable/v1/apps/${env.BITABLE_APP_TOKEN}/tables/${env.BITABLE_TABLE_ID}/records`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ fields }),
      }
    );

    const result = await apiRes.json();

    if (result.code === 0) {
      return new Response(JSON.stringify({ ok: true }), { headers: corsHeaders });
    } else {
      return new Response(
        JSON.stringify({ ok: false, error: result.msg, code: result.code }),
        { status: 400, headers: corsHeaders }
      );
    }
  } catch (err) {
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
}

// OPTIONS preflight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// —— 飞书 token（Worker 环境没有持久缓存，每次冷启动重新获取）——
async function getTenantToken(env) {
  const res = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      app_id: env.FEISHU_APP_ID,
      app_secret: env.FEISHU_APP_SECRET,
    }),
  });
  const data = await res.json();
  if (!data.tenant_access_token) {
    throw new Error(`飞书 token 获取失败: ${data.msg}`);
  }
  return data.tenant_access_token;
}

// —— 字段映射（与 proxy.js 保持一致）——
function mapFields(formData) {
  const text = (v) => v || '';
  const single = (v) => v || '';
  const multi = (v) => {
    if (!v) return [];
    return v.split(',').map(s => s.trim()).filter(Boolean);
  };
  const ts = () => Date.now();
  const url = (v) => v ? { link: v, text: v } : null;

  return {
    // 文本
    '昵称': text(formData.nickname),
    '微信号': text(formData.wechat),
    '所在城市': text(formData.city),
    '职业': text(formData.occupation),
    '最满意的产品': text(formData.builderProduct),
    '在做的项目': text(formData.builderProject),
    '负责的产品或业务': text(formData.strategistProduct),
    '增长案例': text(formData.strategistCase),
    '最想学什么': text(formData.learnerInterest),
    // 单选
    'AI使用频率': single(formData.aiFrequency),
    '来源渠道': single(formData.source),
    '角色': single(formData.role),
    'AI写代码频率': single(formData.builderAICode),
    '创作频率': single(formData.creatorFrequency),
    '行业': single(formData.explorerIndustry),
    'AI了解程度': single(formData.learnerLevel),
    // 多选
    'AI工具': multi(formData.aiTools),
    '技术栈': multi(formData.builderTech),
    '擅长领域': multi(formData.strategistDomain),
    '创作方向': multi(formData.creatorDirection),
    '熟悉的业务场景': multi(formData.explorerScenario),
    '其他领域经验': multi(formData.learnerBackground),
    '想在社群中获得什么': multi(formData.goal),
    // 日期
    '提交时间': ts(),
    // URL
    'GitHub主页': url(formData.builderGitHub),
    '满意作品链接': url(formData.creatorWork),
    // 数字
    '经验年限': formData.explorerYears ? Number(formData.explorerYears) : null,
  };
}
