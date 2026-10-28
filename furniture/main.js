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

  // lead form: checked on the page; sending is connected once the owner picks where requests go
  var form = document.getElementById('lead');
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
