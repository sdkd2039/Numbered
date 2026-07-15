// 1. بيانات الأذكار (أضف أذكارك هنا يدوياً)
const dhikrData = [
    { cat: 'الصباح', id: 's1', text: 'أستغفر الله', target: 100 },
    { cat: 'الصباح', id: 's2', text: 'سبحان الله وبحمده', target: 100 },
    { cat: 'المساء', id: 'm1', text: 'اللهم صل وسلم على نبينا محمد', target: 100 },
    { cat: 'المساء', id: 'm2', text: 'لا إله إلا الله وحده لا شريك له', target: 10 },
    { cat: 'منوع', id: 'n1', text: 'آية الكرسي', target: 1 },
    { cat: 'منوع', id: 'n2', text: 'لا حول ولا قوة إلا بالله', target: 50 }
];

// 2. التصفير الذكي عند بداية يوم جديد
function checkReset() {
    const today = new Date().toDateString();
    if (localStorage.getItem('lastDate') !== today) {
        dhikrData.forEach(d => localStorage.setItem(`c_${d.id}`, 0));
        localStorage.setItem('lastDate', today);
    }
}

// 3. دالة العرض (تحديث الواجهة)
function showDhikr(cat, btn) {
    // تفعيل الزر المختار
    document.querySelectorAll('.sub-tab-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    const container = document.getElementById('dhikr-container');
    if (!container) return;

    const list = dhikrData.filter(d => d.cat === cat);
    
    container.innerHTML = list.map(d => {
        let count = parseInt(localStorage.getItem(`c_${d.id}`) || 0);
        let progress = Math.min((count / d.target) * 100, 100);
        
        return `
            <div class="dhikr-card">
                <div class="dhikr-info">
                    <h3 class="dhikr-text">${d.text}</h3>
                    <div class="progress-bar"><div class="progress-fill" style="width: ${progress}%"></div></div>
                    <small class="counter-display">${count} من ${d.target}</small>
                </div>
                <button class="counter-btn" onclick="inc('${d.id}', '${cat}')">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
        `;
    }).join('');
}

// 4. دالة الزيادة
function inc(id, cat) {
    let count = parseInt(localStorage.getItem(`c_${id}`) || 0);
    localStorage.setItem(`c_${id}`, count + 1);
    const activeBtn = document.querySelector('.sub-tab-btn.active');
    showDhikr(cat, activeBtn);
}

// 5. التشغيل عند التحميل
document.addEventListener('DOMContentLoaded', () => {
    checkReset();
    const firstBtn = document.querySelector('.sub-tab-btn');
    if(firstBtn) showDhikr('الصباح', firstBtn);
});
