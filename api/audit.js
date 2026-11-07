export default async function handler(req, res) {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { url, name, email, phone } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL required' });
    }

    console.log('Audit request for:', url);

    // 1. Быстрый анализ сайта
    let title = 'Не найден';
    let description = 'Не найден';
    let h1 = 'Не найден';
    let hasViewport = false;
    let hasSchema = false;
    let hasCanonical = false;
    let titleLength = 0;
    let descLength = 0;
    
    try {
      const response = await fetch(url, { 
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: AbortSignal.timeout(8000)
      });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const html = await response.text();
      
      const titleMatch = html.match(/<title[^>]*>(.*?)<\/title>/is);
      const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
      const h1Match = html.match(/<h1[^>]*>(.*?)<\/h1>/is);
      
      if (titleMatch) {
        title = titleMatch[1].trim();
        titleLength = title.length;
      }
      if (descMatch) {
        description = descMatch[1].trim();
        descLength = description.length;
      }
      if (h1Match) {
        h1 = h1Match[1].replace(/<[^>]+>/g, '').trim();
      }
      
      hasViewport = /<meta\s+name=["']viewport["']/i.test(html);
      hasSchema = /application\/ld\+json/i.test(html);
      hasCanonical = /<link\s+rel=["']canonical["']/i.test(html);
      
    } catch (fetchError) {
      console.error('Fetch error:', fetchError.message);
      // Продолжаем даже если не смогли получить сайт
    }

    // 2. Отправляем в Telegram
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    
    console.log('Telegram token:', telegramToken ? '✅ есть' : '❌ нет');
    console.log('Telegram chat ID:', telegramChatId ? '✅ есть' : '❌ нет');
    
    if (telegramToken && telegramChatId) {
      const message = `🔍 <b>Новая заявка на SEO-аудит</b>

🌐 Сайт: ${url}
👤 Имя: ${name || 'не указано'}
📧 Email: ${email || 'не указан'}
📱 Телефон: ${phone || 'не указан'}

📊 Технические данные:
• Title: "${title}" (${titleLength} симв.)
• Description: "${description}" (${descLength} симв.)
• H1: "${h1}"
• Viewport: ${hasViewport ? '✅' : '❌'}
• Schema.org: ${hasSchema ? '✅' : '❌'}
• Canonical: ${hasCanonical ? '✅' : '❌'}

⏰ ${new Date().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' })}`;
      
      try {
        const tgResponse = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: telegramChatId,
            text: message,
            parse_mode: 'HTML'
          })
        });
        
        const tgData = await tgResponse.json();
        console.log('Telegram response:', tgData);
      } catch (tgError) {
        console.error('Telegram error:', tgError.message);
      }
    }
    
    // 3. Возвращаем результат клиенту
    res.status(200).json({
      success: true,
      data: {
        url,
        technical: {
          title, titleLength,
          description, descLength,
          h1,
          hasViewport, hasSchema, hasCanonical
        },
        message: 'Аудит готов! Мы свяжемся с вами.'
      }
    });
    
  } catch (error) {
    console.error('General error:', error);
    res.status(500).json({ 
      error: error.message,
      message: 'Произошла ошибка. Напишите нам: @agent24ai'
    });
  }
}
