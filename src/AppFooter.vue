<template>
  <footer class="app-footer">
    <div class="app-footer-divider" aria-hidden="true"></div>
    <p class="app-footer-text">© {{ new Date().getFullYear() }} BlueChonk</p>
  </footer>
</template>

<style scoped>
/* 背景透明：由所在页面/滚动容器统一的固定渐变背景自然透出，不产生色块 */
.app-footer {
  flex: 0 0 auto;
  width: 100%;
  /* sticky footer：auto 外边距吸收上方全部剩余空间，内容不足一屏时页脚沉底；
     原 margin-top: 40px 的间距转入 padding-top，内容超出一屏时间距保持不变 */
  margin-top: auto;
  padding: 40px 24px calc(40px + env(safe-area-inset-bottom));
  text-align: center;
}
.app-footer-divider {
  width: min(720px, 100%);
  height: 10px;
  margin: 0 auto 18px;
  background:
    radial-gradient(circle 2.5px at 50% 1px, var(--text-tertiary) 0 100%, transparent 100%) no-repeat,
    linear-gradient(90deg, transparent 0%, var(--border) 18%, var(--border) 82%, transparent 100%) no-repeat 0 2px / 100% 1px;
}
.app-footer-text {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.02em;
  color: var(--text-tertiary);
}

@media (max-width: 520px) {
  .app-footer {
    padding: 28px 16px calc(32px + env(safe-area-inset-bottom));
  }
  .app-footer-divider {
    margin-bottom: 14px;
  }
  .app-footer-text {
    font-size: 12px;
  }
}
</style>
