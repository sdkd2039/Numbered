// بيانات الأذكار (أضف أو عدل كما تشاء يدوياً هنا)
const dhikrData = [
    { cat: 'الصباح', id: 's1', text: 'أستغفر الله', target: 100 },
    { cat: 'الصباح', id: 's2', text: 'سبحان الله وبحمده', target: 100 },
    { cat: 'المساء', id: 'm1', text: 'اللهم صل وسلم على نبينا محمد', target: 100 },
    { cat: 'المساء', id: 'm2', text: 'لا إله إلا الله وحده لا شريك له', target: 10 },
    { cat: 'منوع', id: 'n1', text: 'لا حول ولا قوة إلا بالله', target: 50 }
];

// دالة عرض الأذكار
function showDhikr(cat, btn) {
    // تحديث تفعيل الأزرار
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const container = document.getElementById('dhikr-container');
    if (!container) return;

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

// دالة زيادة العداد
function inc(id, cat) {
    let count = parseInt(localStorage.getItem(`c_${id}`) || 0);
    localStorage.setItem(`c_${id}`, count + 1);
    
    // إعادة عرض نفس القسم
    const buttons = document.querySelectorAll('.tab-btn');
    let activeBtn = Array.from(buttons).find(b => b.innerText === cat);
    showDhikr(cat, activeBtn);
}

// التصفير التلقائي عند بداية يوم جديد
if(localStorage.getItem('lastDate') !== new Date().toDateString()){
    dhikrData.forEach(d => localStorage.setItem(`c_${d.id}`, 0));
    localStorage.setItem('lastDate', new Date().toDateString());
}

// تشغيل الأذكار عند فتح الصفحة
window.onload = () => {
    // تشغيل الصباح كافتراضي
    const defaultBtn = document.querySelector('.tab-btn');
    if(defaultBtn) showDhikr('الصباح', defaultBtn);
};
