const {
  getDebugOpenId,
  isDebugModeOn,
  isDebugUiEnabled,
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
      // getDebugOpenId 在调试开着时保证返回 dbg_*
      const id = getDebugOpenId();
      if (!isDbgId(id)) {
        // 理论上不可达；仍大声提示
        this.setData({
          visible: true,
          label: '异常：无 dbg_*，请重开调试',
          mismatch: true,
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
