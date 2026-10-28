(function () {
  var top = document.querySelector('.top');
  addEventListener('scroll', function () { top.classList.toggle('scrolled', scrollY > 20); }, { passive: true });

  // "what we make": the hovered or focused row swaps the big preview
  var rows = [].slice.call(document.querySelectorAll('.make-list li'));
  var pics = [].slice.call(document.querySelectorAll('.make-view img'));
  function pick(i) {
    rows.forEach(function (r, k) { r.classList.toggle('on', k === i); });
    pics.forEach(function (p, k) { p.classList.toggle('on', k === i); });
  }
  rows.forEach(function (r, i) {
    r.addEventListener('mouseenter', function () { pick(i); });
    r.addEventListener('focusin', function () { pick(i); });
  });
  if (rows.length) pick(0);

  // path: the step in the middle of the screen lights up and shows its photo
  var steps = [].slice.call(document.querySelectorAll('.step'));
  var shots = [].slice.call(document.querySelectorAll('.path-view img'));
  var count = document.querySelector('.path-count b');
  if ('IntersectionObserver' in window && steps.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var i = steps.indexOf(e.target);
        steps.forEach(function (s, k) { s.classList.toggle('on', k === i); });
        shots.forEach(function (s, k) { s.classList.toggle('on', k === i); });
        count.textContent = '0' + (i + 1);
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    steps.forEach(function (s) { io.observe(s); });
  }

  // messenger links are not set up yet: don't jump to the top of the page
  document.querySelectorAll('[data-stub-link]').forEach(function (a) {
    a.addEventListener('click', function (e) { e.preventDefault(); });
  });

  // configurator: the form is the source of truth; the 3D module (konstruktor.js) only listens.
  // ЗАГЛУШКА: ставки ниже — грубые, заменить на реальные цены компании.
  var RATE = { mirror: 5500, bronze: 7000, oak: 3800, walnut: 4000, ash: 3800, grey: 3800, white: 3600, graphite: 3800, mix: 4700, combo: 5200 }; // ₽ за м² фасада
  var BOARD = 2200, BACK = 400, DOOR = 4500, RAIL = 600, DRAWERS = 7500; // ₽: м² ЛДСП, м² задней стенки, система на дверь, штанга, блок из 3 ящиков
  var kon = document.getElementById('kon-form');
  var lead = document.getElementById('lead');
  function readKon() {
    var f = kon.elements;
    var pick = function (n) { return kon.querySelector('input[name="' + n + '"]:checked'); };
    return {
      w: +f.w.value / 1000, h: +f.h.value / 1000, d: +pick('d').value / 1000, doors: +pick('doors').value,
      facade: pick('facade').value, corpus: pick('corpus').value, profile: pick('profile').value, interior: pick('interior').value,
      names: { facade: pick('facade').dataset.name, corpus: pick('corpus').dataset.name, profile: pick('profile').dataset.name, interior: pick('interior').dataset.name }
    };
  }
  function price(c) {
    var sw = c.w / c.doors, inner = c.d - 0.1;
    var boards = 2 * c.h * c.d + 2 * c.w * c.d + (c.doors - 1) * c.h * inner;
    var layout = { balanced: ['rail', 'drawers', 'shelves', 'rail'], rails: ['rail', 'rail', 'shelves', 'rail'], shelves: ['shelves', 'drawers', 'shelves', 'rail'] }[c.interior];
    var extra = 0;
    for (var i = 0; i < c.doors; i++) {
      var k = layout[i % 4];
      var shelves = k === 'shelves' ? Math.max(2, Math.round((c.h - 0.5) / 0.36) - 1) + 1 : 2;
      boards += shelves * sw * inner;
      if (k !== 'shelves') extra += RAIL;
      if (k === 'drawers') extra += DRAWERS;
    }
    var sum = boards * BOARD + c.w * c.h * BACK + c.w * c.h * RATE[c.facade] + c.doors * DOOR + extra;
    sum += Math.max(3000, sum * 0.1); // доставка и сборка
    return Math.round(sum / 1000) * 1000;
  }
  function summary(c) {
    return 'Шкаф-купе ' + Math.round(c.w * 1000) + '×' + Math.round(c.h * 1000) + '×' + Math.round(c.d * 1000) + ' мм, ' + c.doors + ' двери, фасады: ' + c.names.facade.toLowerCase() +
      ', корпус: ' + c.names.corpus.toLowerCase() + ', профиль: ' + c.names.profile.toLowerCase() + ', наполнение ' + c.names.interior;
  }
  function syncKon() {
    var f = kon.elements;
    var w = +f.w.value;
    // a door is comfortable between 50 and 120 cm wide: offer only the counts that fit this width
    var radios = kon.querySelectorAll('input[name="doors"]'), chosen = null, best = null;
    radios.forEach(function (r) {
      var dw = w / +r.value;
      r.disabled = dw < 500 || dw > 1200;
      if (!r.disabled && (!best || Math.abs(dw - 800) < Math.abs(w / +best.value - 800))) best = r;
      if (r.checked && !r.disabled) chosen = r;
    });
    if (!chosen && best) best.checked = true;
    f.wOut.value = w.toLocaleString('ru-RU');
    f.hOut.value = (+f.h.value).toLocaleString('ru-RU');
    var c = readKon();
    kon.querySelectorAll('[data-out]').forEach(function (el) {
      var k = el.dataset.out;
      el.textContent = k === 'price' ? '≈ ' + price(c).toLocaleString('ru-RU') + ' ₽' : c.names[k];
    });
    window.wardrobe = c;
    dispatchEvent(new CustomEvent('wardrobe:change', { detail: c }));
  }
  if (kon) {
    // sliders fire many times per second; rebuilding the model once per frame is plenty
    var queued = false;
    kon.addEventListener('input', function () {
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () { queued = false; syncKon(); });
    });
    syncKon();
    kon.addEventListener('submit', function (e) {
      e.preventDefault();
      var c = readKon();
      var text = summary(c) + '. Ориентировочно ' + price(c).toLocaleString('ru-RU') + ' ₽.';
      var note = lead.querySelector('.form-project');
      note.textContent = 'Проект из конструктора: ' + text;
      note.hidden = false;
      lead.elements.project.value = text;
      var box = lead.querySelector('input[name="what"][value="Шкаф-купе"]');
      if (box) box.checked = true;
      document.getElementById('zamer').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
      setTimeout(function () { lead.elements.name.focus({ preventScroll: true }); }, 600);
    });
  }

  // lead form: checked on the page; sending is connected once the owner picks where requests go
  var form = lead;
  if (!form) return;
  var msg = form.querySelector('.form-msg');
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = form.elements.name, phone = form.elements.phone;
    var digits = phone.value.replace(/\D/g, '');
    var badName = !name.value.trim(), badPhone = digits.length < 10;
    name.setAttribute('aria-invalid', badName);
    phone.setAttribute('aria-invalid', badPhone);
    if (badName || badPhone) {
      msg.className = 'form-msg err';
      msg.textContent = badName ? 'Напишите, как к вам обращаться.' : 'Проверьте номер телефона: нужно 10–11 цифр.';
      (badName ? name : phone).focus();
      return;
    }
    msg.className = 'form-msg ok';
    msg.textContent = 'Спасибо! Перезвоним, чтобы договориться о замере. (Демо: отправка заявок подключается при запуске сайта.)';
    form.querySelector('button').disabled = true;
  });
})();
