<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>معدودات - منصة الأذكار والأصوات</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
        :root { --bg: #0d1117; --card: #161b22; --primary: #0284c7; --text: #f8fafc; }
        * { box-sizing: border-box; margin: 0; padding: 0; font-family: 'Tajawal', sans-serif; }
        body { background: var(--bg); color: var(--text); padding: 20px; display: flex; justify-content: center; }
        .app-container { width: 100%; max-width: 500px; }
        
        /* تصميم الأذكار */
        .dhikr-card { background: var(--card); padding: 20px; border-radius: 16px; margin-bottom: 15px; border: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }
        .counter-btn { background: var(--primary); color: white; border: none; padding: 10px 20px; border-radius: 8px; cursor: pointer; font-weight: bold; }
        
        /* التصميم التبادلي */
        .tabs { display: flex; gap: 10px; margin-bottom: 20px; overflow-x: auto; padding-bottom: 5px; }
        .tab-btn { background: #21262d; color: white; border: none; padding: 10px 15px; border-radius: 8px; cursor: pointer; white-space: nowrap; }
        .tab-btn.active { background: var(--primary); }
    </style>
</head>
<body>

<div class="app-container">
    <h1 style="text-align: center; margin-bottom: 20px;">أذكار اليوم</h1>
    
    <div class="tabs">
        <button class="tab-btn active" onclick="showDhikr('الصباح', this)">الصباح</button>
        <button class="tab-btn" onclick="showDhikr('المساء', this)">المساء</button>
        <button class="tab-btn" onclick="showDhikr('منوع', this)">منوع</button>
    </div>

    <div id="dhikr-container"></div>
</div>

<script>
    const dhikrData = [
        { cat: 'الصباح', id: 's1', text: 'أستغفر الله', target: 100 },
        { cat: 'المساء', id: 'm1', text: 'سُبحان الله', target: 50 },
        { cat: 'منوع', id: 'n1', text: 'لا حول ولا قوة إلا بالله', target: 30 }
    ];

    function showDhikr(cat, btn) {
        // تحديث الأزرار
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const container = document.getElementById('dhikr-container');
        const list = dhikrData.filter(d => d.cat === cat);
        
        container.innerHTML = list.map(d => {
            let count = localStorage.getItem(`c_${d.id}`) || 0;
            return `
                <div class="dhikr-card">
                    <div>
                        <h3 style="font-size: 1rem;">${d.text}</h3>
                        <small style="color: #94a3b8;">${count} / ${d.target}</small>
                    </div>
                    <button class="counter-btn" onclick="inc('${d.id}', '${cat}')">+</button>
                </div>
            `;
        }).join('');
    }

    function inc(id, cat) {
        let count = parseInt(localStorage.getItem(`c_${id}`) || 0);
        localStorage.setItem(`c_${id}`, count + 1);
        showDhikr(cat, document.querySelector('.tab-btn.active'));
    }

    // تصفير تلقائي عند الساعة 12
    if(localStorage.getItem('lastDate') !== new Date().toDateString()){
        dhikrData.forEach(d => localStorage.setItem(`c_${d.id}`, 0));
        localStorage.setItem('lastDate', new Date().toDateString());
    }

    // تشغيل الصباح أول ما يفتح
    showDhikr('الصباح', document.querySelector('.tab-btn'));
</script>

</body>
</html>
