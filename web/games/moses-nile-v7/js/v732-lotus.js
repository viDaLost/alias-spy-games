(() => {
  'use strict';
  if (window.__mosesV732LotusInstalled || !window.THREE || !window.assetManager) return;
  window.__mosesV732LotusInstalled = true;

  const THREE = window.THREE;
  const ASSET = window.assetManager;
  const previousPreload = ASSET.preloadEnvironmentModels.bind(ASSET);

  function lotusColor(name) {
    const id = String(name || '').toLowerCase();
    if (id.includes('center')) return 0xe7bd43;
    if (id.includes('inner')) return 0xf8cadc;
    if (id.includes('mid')) return 0xef8eb6;
    if (id.includes('outer')) return 0xd95d8e;
    return 0xee91b8;
  }

  function prepareLotus(root) {
    root.name = 'ProjectOwnedNileLotus';
    root.traverse?.((node) => {
      if (!node?.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      node.material = new THREE.MeshStandardMaterial({
        color: lotusColor(node.name || node.parent?.name),
        roughness: .72,
        metalness: 0,
        side: THREE.DoubleSide,
      });
    });
    return root;
  }

  ASSET.preloadEnvironmentModels = async function preloadV732Lotus() {
    await previousPreload();
    if (!this.__v732LotusPromise) {
      this.__v732LotusPromise = this._tryLoad('models/v73/lotus-flower.obj')
        .then((root) => {
          if (!root) return null;
          this.models.lotusFlower = prepareLotus(root);
          window.__mosesLotusSource = 'project-owned-obj';
          console.log('[V7.3.2] project-owned lotus model loaded');
          return this.models.lotusFlower;
        })
        .catch((error) => {
          console.warn('[V7.3.2] lotus OBJ fallback:', error?.message || error);
          window.__mosesLotusSource = 'v73-flower-fallback';
          return this.models.lotusFlower || null;
        });
    }
    await this.__v732LotusPromise;
    return this.models;
  };
})();
