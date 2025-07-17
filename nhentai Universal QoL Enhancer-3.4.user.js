// ==UserScript==
// @name         nhentai Universal QoL Enhancer (Fixed Again)
// @namespace    http://tampermonkey.net/
// @version      3.4.4
// @description  Universal QoL: Unblurs, clicks, proxy bypass, DYNAMIC fit, preloads, no text select, INSTANT SPA CLICKS (retains scroll), keyboard navigation on nhentai.net & nhentai-xxx.
// @author       nekohacker591 (with fixes by your AI buddy)
// @match        *://nhentai.net/g/*/*
// @match        *://nhentai-xxx.pornproxy.app/g/*/*
// @match        *://nhentai.net/*
// @match        *://nhentai-xxx.pornproxy.app/*
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    console.log('Universal nhentai QoL Script v3.4.4: Initializing...');

    // --- Site Detection & Config ---
    const isOfficialSite = window.location.hostname === 'nhentai.net';
    const isProxySite = window.location.hostname.includes('nhentai-xxx.pornproxy.app');
    const PRELOAD_AHEAD = 5;
    const DYNAMIC_HEIGHT_PADDING = 15;
    // --- UPDATED THIS ---
    const knownProxyHosts = ['image.staticox.com', 'image.imagexox.com']; // Array of known shitty proxy hosts

    // --- Helper Functions ---
    function rewriteImageUrl(imageUrl) {
        if (!imageUrl || typeof imageUrl !== 'string') return null;
        try {
            const urlObj = new URL(imageUrl);
            // --- UPDATED THIS ---
            if (knownProxyHosts.includes(urlObj.hostname) && urlObj.searchParams.has('url')) {
                const originalUrlEncoded = urlObj.searchParams.get('url');
                const originalUrlDecoded = decodeURIComponent(originalUrlEncoded);
                if (originalUrlDecoded.startsWith('http://') || originalUrlDecoded.startsWith('https://')) {
                    if (originalUrlDecoded.includes('.nhentaimg.com') || originalUrlDecoded.includes('.nhentai.net')) {
                        return originalUrlDecoded.replace(/^http:/, 'https:');
                    }
                    return originalUrlDecoded;
                }
            }
        } catch (e) {}
        return null;
    }

    function processImageNodeProxy(imgNode) {
        let changed = false;
        const dataSrc = imgNode.dataset.src;
        const currentSrc = imgNode.getAttribute('src');
        const isGalleryItemThumb = imgNode.closest('.gallery_item') !== null;
        const isTagThumb = imgNode.closest('.tags_thumbs .thumb') !== null;
        
        // --- UPDATED THIS ---
        if (dataSrc && knownProxyHosts.some(host => dataSrc.includes(host))) {
            const directUrl = rewriteImageUrl(dataSrc);
            if (directUrl) {
                imgNode.dataset.src = directUrl;
                if (isTagThumb || isGalleryItemThumb) {
                    if (!currentSrc || currentSrc.startsWith('data:image') || knownProxyHosts.some(host => currentSrc.includes(host))) {
                        imgNode.setAttribute('src', directUrl);
                    }
                } else if ((imgNode.classList.contains('loaded') || imgNode.classList.contains('entered')) && currentSrc && knownProxyHosts.some(host => currentSrc.includes(host))) {
                    const directSrcUrl = rewriteImageUrl(currentSrc);
                    if (directSrcUrl) {
                        imgNode.setAttribute('src', directSrcUrl);
                    }
                }
                changed = true;
            }
        // --- AND UPDATED THIS ---
        } else if (currentSrc && knownProxyHosts.some(host => currentSrc.includes(host))) {
            const directUrl = rewriteImageUrl(currentSrc);
            if (directUrl) {
                imgNode.setAttribute('src', directUrl);
                changed = true;
            }
        }
        return changed;
    }

    function getCurrentPageFromUrl() {
        const match = window.location.pathname.match(/\/g\/(\d+)\/(\d+)\/?$/);
        return match ? { galleryId: match[1], pageNum: parseInt(match[2], 10) } : null;
    }

    // --- Preloading Logic ---
    let preloadCache = {};
    let currentlyPreloading = new Set();

    function getPageImageUrl_Proxy(pageNumber, galleryData) {
        if (!galleryData) {
            console.error(`[QoL Universal Script] Proxy URL Error: Gallery data is null for page ${pageNumber}. Cannot generate image URL.`);
            return null;
        }

        const pageNumStr = pageNumber.toString();

        if (galleryData.g_th && galleryData.g_th.fl && galleryData.g_th.fl[pageNumStr]) {
            if (galleryData.imageDir && galleryData.proxyGalleryId && galleryData.serverId) {
                try {
                    const pageInfoString = galleryData.g_th.fl[pageNumStr];
                    if (typeof pageInfoString !== 'string' || pageInfoString.indexOf(',') === -1) {
                        console.warn(`[QoL Universal Script] Proxy URL Warning: g_th.fl[${pageNumStr}] for page ${pageNumber} is not a valid string or format: '${pageInfoString}'. Attempting fallback.`);
                    } else {
                        const typeCode = pageInfoString.split(',')[0];
                        const ext = { 'j': 'jpg', 'p': 'png', 'g': 'gif', 'w': 'webp' }[typeCode];

                        if (ext) {
                            const baseUrl = `https://i${galleryData.serverId}.nhentaimg.com/${galleryData.imageDir}/${galleryData.proxyGalleryId}/`;
                            const imageUrl = `${baseUrl}${pageNumber}.${ext}`.replace(/^http:/, 'https:');
                            return imageUrl;
                        } else {
                            console.warn(`[QoL Universal Script] Proxy URL Warning: Unknown typeCode '${typeCode}' for page ${pageNumber} (key '${pageNumStr}') from g_th. Attempting fallback to .jpg.`);
                        }
                    }
                } catch (e) {
                    console.error(`[QoL Universal Script] Proxy URL Error: Error processing g_th for page ${pageNumber} (key '${pageNumStr}'):`, e, "Attempting fallback.");
                }
            } else {
                console.warn(`[QoL Universal Script] Proxy URL Warning: g_th data found for page ${pageNumber} (key '${pageNumStr}'), but essential galleryData (imageDir, proxyGalleryId, or serverId) is missing. Attempting fallback.`);
            }
        }

        if (galleryData.imageDir && galleryData.proxyGalleryId && galleryData.serverId) {
            const fallbackUrl = `https://i${galleryData.serverId}.nhentaimg.com/${galleryData.imageDir}/${galleryData.proxyGalleryId}/${pageNumber}.jpg`.replace(/^http:/, 'https:');
            return fallbackUrl;
        }

        console.error(`[QoL Universal Script] Proxy URL Error: Insufficient data to construct URL for page ${pageNumber}. Missing critical galleryData: imageDir='${galleryData.imageDir}', proxyGalleryId='${galleryData.proxyGalleryId}', serverId='${galleryData.serverId}'.`);
        return null;
    }

    function getPageImageUrl_Official(pageNumber, galleryData) {
        if (!galleryData || !galleryData.media_id || !galleryData.images || !galleryData.images.pages || !galleryData.images.pages[pageNumber - 1]) {
            return null;
        }
        try {
            const pageInfo = galleryData.images.pages[pageNumber - 1];
            const typeCode = pageInfo.t;
            const ext = { 'j': 'jpg', 'p': 'png', 'g': 'gif' }[typeCode] || 'jpg';
            const mediaId = galleryData.media_id;
            const serverSubdomain = window._n_app?.media_server ? `i${window._n_app.media_server}` : 'i';
            const url = `https://${serverSubdomain}.nhentai.net/galleries/${mediaId}/${pageNumber}.${ext}`;
            return url;
        } catch (e) {
            console.error(`Official Preload URL Error: Page ${pageNumber}`, e);
            return null;
        }
    }

    function preloadImage(url) {
        if (!url || preloadCache[url] || currentlyPreloading.has(url)) return;
        currentlyPreloading.add(url);
        const img = new Image();
        img.onload = () => {
            preloadCache[url] = img;
            currentlyPreloading.delete(url);
        };
        img.onerror = () => {
            console.warn(`Preload Failed: ${url}`);
            currentlyPreloading.delete(url);
        };
        img.src = url;
    }

    function triggerPreload(galleryData) {
        const currentPage = galleryData.currentPage;
        const totalPages = galleryData.num_pages || galleryData.totalPages;
        if (currentPage === null || !totalPages || !galleryData) return;
        const startPage = currentPage + 1;
        const endPage = Math.min(currentPage + PRELOAD_AHEAD, totalPages);
        const urlGetter = isOfficialSite ? getPageImageUrl_Official : getPageImageUrl_Proxy;
        for (let i = startPage; i <= endPage; i++) {
            const imageUrl = urlGetter(i, galleryData);
            preloadImage(imageUrl);
        }
    }

    // --- Gallery Data Parsers ---
    let parsedGalleryData = null;

    function getGalleryData_Proxy() {
        const pageInfo = getCurrentPageFromUrl();
        const currentPage = pageInfo ? pageInfo.pageNum : null;
        const galleryIdFromUrl = pageInfo ? pageInfo.galleryId : null;
        const totalPagesStr = document.getElementById('pages')?.value;
        const imageDir = document.getElementById('image_dir')?.value;
        const proxyGalleryIdInput = document.getElementById('gallery_id')?.value;
        const serverId = document.getElementById('server_id')?.value;
        let g_th_data = null;
        const scripts = document.getElementsByTagName('script');
        for (let script of scripts) {
            if (script.textContent.includes('var g_th = $.parseJSON')) {
                try {
                    const jsonMatch = script.textContent.match(/var g_th = \$.parseJSON\('(.*)'\);/s);
                    if (jsonMatch && jsonMatch[1]) {
                        const jsonString = jsonMatch[1].replace(/\\'/g, "'").replace(/\\"/g, '"');
                        g_th_data = JSON.parse(jsonString);
                        break;
                    }
                } catch (e) {
                    console.error("Proxy g_th parse failed.", e);
                }
            }
        }
        if (currentPage !== null && totalPagesStr && imageDir && proxyGalleryIdInput && serverId && galleryIdFromUrl) {
            return {
                currentPage: currentPage,
                totalPages: parseInt(totalPagesStr, 10),
                imageDir: imageDir,
                proxyGalleryId: proxyGalleryIdInput,
                serverId: serverId,
                g_th: g_th_data,
                navGalleryId: galleryIdFromUrl
            };
        }
        return null;
    }

    function getGalleryData_Official() {
        const pageInfo = getCurrentPageFromUrl();
        const currentPage = pageInfo ? pageInfo.pageNum : null;
        if (typeof window._gallery !== 'undefined' && window._gallery && currentPage !== null) {
            return { ...window._gallery, currentPage: currentPage, navGalleryId: window._gallery.id };
        }
        return null;
    }

    function getCombinedGalleryData() {
        if (parsedGalleryData) return parsedGalleryData;
        if (isOfficialSite) {
            parsedGalleryData = getGalleryData_Official();
        } else if (isProxySite) {
            parsedGalleryData = getGalleryData_Proxy();
        }
        return parsedGalleryData;
    }

    // --- Proxy Nav Link Updater ---
    function updateProxyNavLinks() {
        if (!isProxySite) return;
        const galleryData = getCombinedGalleryData();
        if (!galleryData || !galleryData.navGalleryId || !galleryData.currentPage || !galleryData.totalPages) {
            return;
        }
        const { navGalleryId, currentPage, totalPages } = galleryData;
        const baseUrl = `/g/${navGalleryId}/`;
        document.querySelectorAll('.reader_nav').forEach(navBar => {
            const firstLink = navBar.querySelector('.rd_first');
            const prevLink = navBar.querySelector('.rd_prev');
            const nextLink = navBar.querySelector('.rd_next');
            const lastLink = navBar.querySelector('.rd_last');
            const pageNumDisplay = navBar.querySelector('.pages_btn .cr');
            const totalPageDisplay = navBar.querySelector('.pages_btn .tp');

            if(pageNumDisplay) pageNumDisplay.textContent = currentPage;
            if(totalPageDisplay) totalPageDisplay.textContent = totalPages;

            if (firstLink) {
                if (currentPage > 1) { firstLink.href = `${baseUrl}1/`; firstLink.classList.remove('invisible'); }
                else { firstLink.removeAttribute('href'); firstLink.classList.add('invisible'); }
            }
            if (prevLink) {
                if (currentPage > 1) { prevLink.href = `${baseUrl}${currentPage - 1}/`; prevLink.classList.remove('invisible'); }
                else { prevLink.removeAttribute('href'); prevLink.classList.add('invisible'); }
            }
            if (nextLink) {
                if (currentPage < totalPages) { nextLink.href = `${baseUrl}${currentPage + 1}/`; nextLink.classList.remove('invisible'); }
                else { nextLink.removeAttribute('href'); nextLink.classList.add('invisible'); }
            }
            if (lastLink) {
                if (currentPage < totalPages) { lastLink.href = `${baseUrl}${totalPages}/`; lastLink.classList.remove('invisible'); }
                else { lastLink.removeAttribute('href'); lastLink.classList.add('invisible'); }
            }
        });
    }

    // --- QoL Feature: Dynamic Height Adjustment ---
    let lastAppliedHeight = 0;
    let adjustHeightAttempts = 0;
    const MAX_ADJUST_ATTEMPTS = 10;

    function applyHeightStyle(imageElement, availableHeight) {
        if (!imageElement) return;
        if (availableHeight > 50) {
            const newHeightPx = `${availableHeight.toFixed(1)}px`;
            if (imageElement.style.maxHeight !== newHeightPx) {
                imageElement.style.setProperty('max-height', newHeightPx, 'important');
                lastAppliedHeight = availableHeight;
            }
        } else {
            console.warn(`[QoL AdjustHeight] Calculated height (${availableHeight.toFixed(1)}px) too small. Removing JS style.`);
            imageElement.style.removeProperty('max-height');
            lastAppliedHeight = 0;
        }
    }

    function performHeightAdjustment() {
        let topBar, bottomBar, imageElement;
        const windowHeight = window.innerHeight;
        let topBarHeight = 0, bottomBarHeight = 0;
        let elementsFound = false;
        if (isOfficialSite) {
            const bars = document.querySelectorAll('#content > section.reader-bar');
            imageElement = document.querySelector('#image-container > a > img');
            if (bars.length === 2 && imageElement) { topBar = bars[0]; bottomBar = bars[1]; elementsFound = true; }
        } else if (isProxySite) {
            const navs = document.querySelectorAll('div.reader_nav');
            imageElement = document.getElementById('fimg');
            if (navs.length >= 1 && imageElement) { topBar = navs[0]; bottomBar = navs.length > 1 ? navs[navs.length -1] : navs[0]; elementsFound = true; }
        }
        if (!elementsFound || !imageElement) {
            adjustHeightAttempts++;
            if (adjustHeightAttempts < MAX_ADJUST_ATTEMPTS) setTimeout(performHeightAdjustment, 200);
            else console.error("[QoL AdjustHeight] Failed to find elements after multiple attempts.");
            return;
        }
        topBarHeight = topBar.getBoundingClientRect().height;
        bottomBarHeight = bottomBar.getBoundingClientRect().height;

        if (topBarHeight < 1 && bottomBarHeight < 1 && isProxySite && document.querySelectorAll('div.reader_nav').length === 2) {
             const topPageBtn = topBar.querySelector('.pages_btn');
             const bottomPageBtn = bottomBar.querySelector('.pages_btn');
             if (topPageBtn) topBarHeight = topPageBtn.getBoundingClientRect().height + 10;
             if (bottomPageBtn) bottomBarHeight = bottomPageBtn.getBoundingClientRect().height + 10;
        }

        if (topBarHeight < 1 || bottomBarHeight < 1) {
            adjustHeightAttempts++;
            if (adjustHeightAttempts < MAX_ADJUST_ATTEMPTS) setTimeout(performHeightAdjustment, 200 * (adjustHeightAttempts + 1));
            else { console.error("[QoL AdjustHeight] Failed to get valid bar heights. Max height style removed."); imageElement.style.removeProperty('max-height'); lastAppliedHeight = 0; }
            return;
        }
        const availableHeight = windowHeight - topBarHeight - bottomBarHeight - DYNAMIC_HEIGHT_PADDING;
        applyHeightStyle(imageElement, availableHeight);
        adjustHeightAttempts = 0;
    }

    function triggerHeightAdjustment() {
        adjustHeightAttempts = 0;
        lastAppliedHeight = 0;
        requestAnimationFrame(performHeightAdjustment);
    }

    // --- Inject CSS ---
    GM_addStyle(`
        #image-container img, #fimg, .rd_fimg img {
            display: block !important; margin-left: auto !important; margin-right: auto !important;
            max-width: 98vw !important; width: auto !important; height: auto !important;
            object-fit: contain !important; pointer-events: auto !important;
        }
        #fimg, .rd_fimg img, .rd_fimg.filtered_reader {
            filter: none !important; -webkit-filter: none !important;
            opacity: 1 !important; visibility: visible !important;
        }
        #image-container > a, .rd_fimg .nx_nv, .rd_fimg .pr_nv, .rd_fimg .fw_img, .reader-bar a, .reader-bar button, .reader_nav a, .reader_nav button {
            -webkit-user-select: none; -moz-user-select: none; -ms-user-select: none; user-select: none;
        }
        .reader_overlay .alert, .outer_thumbs > .alert.alert-warning { display: none !important; }
        .reader_overlay { background: none !important; position: relative !important; }
        .gallery_item img.lazyload.filtered, .cover img.lazyload.filtered, .gt_th img.filtered, img.lazyload.filtered {
            filter: none !important; -webkit-filter: none !important; opacity: 1 !important; visibility: visible !important; pointer-events: auto !important;
        }
        #fav_nl, #dl_nl, button.mbtn.disabled {
            pointer-events: auto !important; cursor: pointer !important; opacity: 1 !important;
            background-color: #333 !important; color: #fff !important; border-color: #555 !important;
        }
        .com_link { pointer-events: auto !important; cursor: pointer !important; opacity: 1 !important; visibility: visible !important; color: #ccc !important; text-decoration: underline !important; }
        #image-container > a, .rd_fimg a, .rd_fimg .pr_nv, .rd_fimg .nx_nv, .rd_fimg .fw_img {
            pointer-events: auto !important; cursor: pointer !important; display: block !important; visibility: visible !important; opacity: 1 !important;
        }
        .rd_fimg .pr_nv, .rd_fimg .nx_nv {
            width: 50% !important; height: 100% !important; position: absolute !important; top: 0 !important; z-index: 10 !important;
        }
        .rd_fimg .pr_nv { left: 0 !important; } .rd_fimg .nx_nv { right: 0 !important; }
        .reader-bar .go-back, .reader-bar .first, .reader-bar .previous, .reader-bar .page-number, .reader-bar .next, .reader-bar .last,
        .reader_nav .back_btn, .reader_nav .rd_first, .reader_nav .rd_prev, .reader_nav .pages_btn, .reader_nav .rd_next, .reader_nav .rd_last {
            pointer-events: auto !important; cursor: pointer !important; visibility: visible !important; opacity: 1 !important; color: inherit !important;
        }
        .reader-pagination a.invisible, .reader_nav a.invisible, .reader_nav button.invisible {
             visibility: visible !important; opacity: 1 !important; pointer-events: auto !important; cursor: pointer !important; color: inherit !important;
        }
        .gallery a, .gallery_item a, #cover a, .cover a, .gt_th a {
            pointer-events: auto !important; cursor: pointer !important; display: block !important; visibility: visible !important; opacity: 1 !important;
        }
    `);

    // --- MutationObserver ---
    const observer = new MutationObserver(mutations => {
        let mainImageChanged = false;
        mutations.forEach(mutation => {
            if (isProxySite && mutation.addedNodes.length) {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) {
                        if (node.tagName === 'IMG') processImageNodeProxy(node);
                        else if (node.querySelectorAll) node.querySelectorAll('img').forEach(processImageNodeProxy);
                    }
                });
            }
            if (mutation.type === 'attributes' && mutation.target.tagName === 'IMG') {
                const imgTarget = mutation.target;
                if (isProxySite) processImageNodeProxy(imgTarget);
                const officialImg = isOfficialSite && imgTarget.closest('#image-container');
                const proxyImg = isProxySite && imgTarget.id === 'fimg';
                const isMainImageSrcChange = (officialImg || proxyImg) && mutation.attributeName === 'src';
                const spaTriggered = imgTarget._isSpaUpdating === true;
                if (isMainImageSrcChange && !spaTriggered) mainImageChanged = true;
                else if (spaTriggered) imgTarget._isSpaUpdating = false;
            }
        });

        if (mainImageChanged) {
            parsedGalleryData = null;
            const galleryData = getCombinedGalleryData();
            if (galleryData) {
                if (isProxySite) updateProxyNavLinks();
                triggerPreload(galleryData);
                triggerHeightAdjustment();
            }
        }
    });
    observer.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['src', 'data-src'] });

    // --- SPA Navigation Logic for Proxy ---
    function handleInstantClickSPA(event, targetPageNum) {
        if (!isProxySite) return;
        if(event) { event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); }

        const currentGalleryData = getCombinedGalleryData();
        if (!currentGalleryData) { console.error("[QoL] SPA Nav: No gallery data."); return; }
        const { totalPages, navGalleryId } = currentGalleryData;
        if (targetPageNum < 1 || targetPageNum > totalPages) return;

        const targetImageUrl = getPageImageUrl_Proxy(targetPageNum, currentGalleryData);
        if (!targetImageUrl) { console.error(`[QoL] SPA Nav: No image URL for page ${targetPageNum}.`); return; }

        const imageElement = document.getElementById('fimg');
        if (!imageElement) { console.error("[QoL] SPA Nav: #fimg not found."); return; }

        const currentScrollY = window.scrollY;
        if(parsedGalleryData) parsedGalleryData.currentPage = targetPageNum;
        history.pushState({ page: targetPageNum, galleryId: navGalleryId }, '', `/g/${navGalleryId}/${targetPageNum}/`);
        updateProxyNavLinks();
        triggerPreload(parsedGalleryData || currentGalleryData);

        imageElement._isSpaUpdating = true;
        imageElement.src = targetImageUrl;
        imageElement.onload = () => { window.scrollTo(0, currentScrollY); imageElement.onload = null; imageElement.onerror = null; imageElement._isSpaUpdating = false; triggerHeightAdjustment(); };
        imageElement.onerror = () => { console.error(`[QoL] SPA Nav: Error loading image ${targetImageUrl}.`); window.scrollTo(0, currentScrollY); imageElement.onload = null; imageElement.onerror = null; imageElement._isSpaUpdating = false; };
    }

    // --- Keyboard Navigation ---
    function handleKeyboardNavigation(event) {
        if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA' || event.target.isContentEditable) return;
        const galleryData = getCombinedGalleryData();
        if (!galleryData || !galleryData.currentPage) return;
        let direction;
        switch (event.key) {
            case 'ArrowRight': direction = 'next'; break;
            case 'ArrowLeft': direction = 'prev'; break;
            case 'Home': direction = 'first'; break;
            case 'End': direction = 'last'; break;
            default: return;
        }
        event.preventDefault();

        if (isOfficialSite) {
            const navBaseSelector = '#content > section.reader-bar';
            const actionSelector = direction === 'next' ? '.next:not(.invisible)' : direction === 'prev' ? '.previous:not(.invisible)' : direction === 'first' ? '.first:not(.invisible)' : '.last:not(.invisible)';
            const targetLinkElement = document.querySelector(`${navBaseSelector}:last-of-type ${actionSelector}`) || document.querySelector(`${navBaseSelector}:first-of-type ${actionSelector}`);
            if (targetLinkElement) targetLinkElement.click();
        } else if (isProxySite) {
            let targetPageNum = galleryData.currentPage;
            if (direction === 'next' && targetPageNum < galleryData.totalPages) targetPageNum++;
            else if (direction === 'prev' && targetPageNum > 1) targetPageNum--;
            else if (direction === 'first') targetPageNum = 1;
            else if (direction === 'last') targetPageNum = galleryData.totalPages;
            if (targetPageNum !== galleryData.currentPage) handleInstantClickSPA(null, targetPageNum);
        }
    }

    // --- Instant Click Listener Setup ---
    function addInstantClickListeners() {
        const setupListener = (target, handler) => {
            let elements = [];
            if (typeof target === 'string') elements = Array.from(document.querySelectorAll(target));
            else if (target instanceof Element) elements = [target];
            else return;
            elements.forEach(element => { element.removeEventListener('click', element._instantClickHandler, true); element._instantClickHandler = handler; element.addEventListener('click', element._instantClickHandler, true); });
        };

        if (isOfficialSite) {
            setupListener('#image-container > a', () => {});
        } else if (isProxySite) {
            const proxyClickHandler = (event, direction) => {
                event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation();
                const currentGalleryDataForClick = getCombinedGalleryData();
                if (!currentGalleryDataForClick || !currentGalleryDataForClick.currentPage) return;
                let targetPageNum = currentGalleryDataForClick.currentPage;
                if (direction === 'next' && targetPageNum < currentGalleryDataForClick.totalPages) targetPageNum++;
                else if (direction === 'prev' && targetPageNum > 1) targetPageNum--;
                else if (direction === 'first') targetPageNum = 1;
                else if (direction === 'last') targetPageNum = currentGalleryDataForClick.totalPages;
                if (targetPageNum !== currentGalleryDataForClick.currentPage) handleInstantClickSPA(event, targetPageNum);
            };
            setupListener('.rd_fimg .nx_nv', (e) => proxyClickHandler(e, 'next'));
            setupListener('.rd_fimg .pr_nv', (e) => proxyClickHandler(e, 'prev'));
            setupListener('.rd_fimg a.fw_img', (e) => {
                const rect = e.target.getBoundingClientRect();
                const clickX = e.clientX - rect.left;
                proxyClickHandler(e, clickX > rect.width / 2 ? 'next' : 'prev');
            });
            document.querySelectorAll('.reader_nav').forEach(navBar => {
                const nextBtn = navBar.querySelector('.rd_next'), prevBtn = navBar.querySelector('.rd_prev'), firstBtn = navBar.querySelector('.rd_first'), lastBtn = navBar.querySelector('.rd_last');
                if(nextBtn) setupListener(nextBtn, (e) => proxyClickHandler(e, 'next'));
                if(prevBtn) setupListener(prevBtn, (e) => proxyClickHandler(e, 'prev'));
                if(firstBtn) setupListener(firstBtn, (e) => proxyClickHandler(e, 'first'));
                if(lastBtn) setupListener(lastBtn, (e) => proxyClickHandler(e, 'last'));
            });
        }
    }

    // --- Initial Setup & Event Listeners ---
    let resizeTimeout;
    function debounceResize() { clearTimeout(resizeTimeout); resizeTimeout = setTimeout(triggerHeightAdjustment, 150); }

    function runInitialSetup() {
        parsedGalleryData = null;
        const galleryData = getCombinedGalleryData();
        const isOnReaderPage = galleryData && window.location.pathname.includes('/g/') && galleryData.currentPage !== null;
        if (isProxySite) document.querySelectorAll('img').forEach(processImageNodeProxy);
        if (isOnReaderPage) {
            if (isProxySite) updateProxyNavLinks();
            triggerPreload(galleryData);
            triggerHeightAdjustment();
            addInstantClickListeners();
            document.removeEventListener('keydown', handleKeyboardNavigation); document.addEventListener('keydown', handleKeyboardNavigation);
            window.removeEventListener('resize', debounceResize); window.addEventListener('resize', debounceResize);
        }
    }

    // --- DOM Ready and Load Events ---
    if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', runInitialSetup); }
    else { runInitialSetup(); }

    window.addEventListener('load', () => {
        parsedGalleryData = null;
        const galleryData = getCombinedGalleryData();
        const isOnReaderPage = galleryData && window.location.pathname.includes('/g/') && galleryData.currentPage !== null;
        if (isOnReaderPage) {
            if (isProxySite) updateProxyNavLinks();
            if (lastAppliedHeight <= 0) setTimeout(triggerHeightAdjustment, 250);
            addInstantClickListeners();
        }
    });

    // Handle back/forward browser navigation for SPA on proxy site
    window.addEventListener('popstate', (event) => {
        if (isProxySite) {
            parsedGalleryData = null;
            const newGalleryData = getCombinedGalleryData();
            if (newGalleryData && newGalleryData.currentPage) {
                const targetImageUrl = getPageImageUrl_Proxy(newGalleryData.currentPage, newGalleryData);
                const imageElement = document.getElementById('fimg');
                if (imageElement && targetImageUrl) {
                    const currentScrollY = window.scrollY;
                    imageElement._isSpaUpdating = true;
                    imageElement.src = targetImageUrl;
                    imageElement.onload = () => { window.scrollTo(0, currentScrollY); imageElement.onload = null; imageElement.onerror = null; imageElement._isSpaUpdating = false; triggerHeightAdjustment(); };
                    imageElement.onerror = () => { console.error(`[QoL] Popstate: Error loading image ${targetImageUrl}`); imageElement.onload = null; imageElement.onerror = null; imageElement._isSpaUpdating = false; };
                    updateProxyNavLinks();
                    triggerPreload(newGalleryData);
                } else { window.location.reload(); }
            } else { window.location.reload(); }
        }
    });

})();
