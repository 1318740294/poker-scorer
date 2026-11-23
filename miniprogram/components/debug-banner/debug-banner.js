const {
  getDebugOpenId,
  isDebugModeOn,
  isDebugUiEnabled,
  identityLabel,
  isDbgId,
} = require('../../utils/debug');

Component({
  data: {
    visible: false,
    label: '',
    mismatch: false,
  },

  lifetimes: {
    attached() {
      this.refresh();
    },
  },

  pageLifetimes: {
    show() {
      this.refresh();
    },
  },

  methods: {
    refresh() {
      if (!isDebugUiEnabled() || !isDebugModeOn()) {
        this.setData({ visible: false, label: '', mismatch: false });
        return;
      }
      const id = getDebugOpenId();
      if (!isDbgId(id)) {
        this.setData({
          visible: true,
          label: '真实 openId（调试已开）',
          mismatch: false,
        });
        return;
      }
      let mismatch = false;
      try {
        const app = getApp();
        mismatch = !!(app && app.globalData && app.globalData.debugMismatch);
      } catch (e) {
        // ignore
      }
      this.setData({
        visible: true,
        label: id,
        mismatch,
      });
    },
  },
});
