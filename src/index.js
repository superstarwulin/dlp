/*
 @author 游侠
 */
function getKey(url, data, num) {
    return (url.replace(/#.+/, "")+(data?("&"+S.param(data)):"")).replace(/\W+/g, '_').substr(-num);
}
/**
 * 缓存文件
 */
function CacheStorage(param) {
    var key = param.key,
        storage = param.storage || sessionStorage;
    if (key) {
        return {
            get: function (name) {
                var value;
                try {
                    return (value = storage.getItem(key + "_" + name)) && JSON.parse(value);
                } catch (e) {
                }
                return null;
            },
            set: function (name, data) {
                //删除过期数据
                try {
                    var keys = [];
                    for (var itemKey in storage) {
                        if (itemKey.indexOf(key + "_") === 0) {
                            keys.push(itemKey);
                        }
                    }
                    if (keys.length > 16) {
                        keys.sort(function (a, b) {
                            return (JSON.parse(storage.getItem(b)).timestamp || 0) - (JSON.parse(storage.getItem(a)).timestamp || 0);
                        });
                        for (var i = keys.length - 1; i >= 8; i--) {
                            storage.removeItem(keys[i]);
                        }
                    }
                } catch (e) {
                }
                //写入数据
                try {
                    if (!data) {
                        storage.removeItem(key + "_" + name)
                    }
                    else {
                        storage.setItem(key + "_" + name, JSON.stringify(data))
                    }
                } catch (e) {
                }
            }
        }
    }
}

function onFetch(cfg, callback) {
    switch (cfg.dataType) {
        case "jsonp":
            cfg.method = cfg.dataType;
            cfg.callback = cfg.jsonpCallback;
            cfg.jsonpCallback = "callback";
            require(["mui/fetch/jsonp"], function (fetch) {
                callback(fetch(cfg.url, cfg).then(function (response) {
                    return response.json();
                }));
            });
            break;
        case "json":
            require(["mui/fetch/fetch"], function (fetch) {
                callback(fetch(cfg.url, cfg).then(function (response) {
                    return response.json();
                }));
            });
            break;
        default:
            require(["mui/fetch/fetch"], function (fetch) {
                callback(fetch(cfg.url, cfg).then(function (response) {
                    return response.text();
                }));
            });
            break;
    }
}

var dlp = {
    /**
     *  @param {Object} cfg 参数，除了下面的参数外，还可用所有KISSY IO 模块的参数
     *  @param {Object} cfg.url 数据请求发送的地址
     *  @param {Object} cfg.dataType 默认支持的类型，如jsonp
     *  @param {Boolean} [cfg.cache=true] 时则会自动给请求 url 加上时间戳.
     *  @param {Boolean} [cfg.cacheExpiryTime=7 * 24 * 60 * 60 * 1000] 缓存失效时间间隔毫秒数,超期之后本地缓存和http缓存同时强制失效,默认为一周
     *  @param {Boolean} [cfg.cacheValidTime=0] 缓存有效时间毫秒数,若存在此时间范围内的缓存则直接使用，不需要向服务器请求最新数据
     *  @param {Boolean} [cfg.cacheDelayTime=0] 在指定的毫秒数之后，如果数据还没有加载成功，则先使用本地缓存
     *  @param {String} [cfg.localCacheType] 本地缓存类型，目前支持"sessionStorage"和"localStorage"
     *  @param {Function} [cfg.localCacheVerify] 检验数据是否可以缓存的函数，例如可以对空数据不缓存
     *  @param {Function} [cfg.dataVerify] 检验数据是否有效的函数，例如返回报错信息的数据时，可以采用备用数据
     *  @param {String} [cfg.multipleCallback=false] 是否支持多次回调，如果支持多次回调，备用数据、本地数据、远程数据可能按顺序多次回调
     *  @param {Object} [cfg.backup] 备用数据的加载参数，将会用KISSY IO模块加载
     *  @param {Object} [cfg.success] 同IO的success参数，回调函数的第三个参数不是IO实例，而是回调的说明信息，包含如下属性：回调数据类型.type(regular|cache|backup|error),回调时状态status(init|loading|success|error|backupsuccess|backuperror)
     *  @param {Object} [cfg.error] 同IO的error参数，回调函数的第三个参数和success一致
     *  @param {Object} [cfg.complete] 同IO的complete参数，回调函数的第三个参数和success一致
     */
    get: function (cfg) {
        var self = this,
            cache = null,
            win = window,
            now = +new Date(),
            lastCbInfo = null,
            cacheExpiryTime = cfg.cacheExpiryTime || (7 * 24 * 60 * 60 * 1000),
            cacheValidTime = cfg.cacheValidTime || 0;
        switch (cfg.localCacheType) {
            case "sessionStorage":
                if (win.sessionStorage) {
                    cache = CacheStorage({key: '_DLP_v1', storage: win.sessionStorage});
                }
                break;
            case "localStorage":
                if (win.localStorage) {
                    cache = CacheStorage({key: '_DLP_v1', storage: win.localStorage});
                }
                break;
        }
        var cacheKey = getKey(cfg.url,cfg.data,1024);
        var cacheData = cache && cache.get(cacheKey);
        if (cacheData && cacheData.timestamp <= now - cacheExpiryTime) {
            cacheData = null;//如果已经过期，则清除
        }
        function callbackCache(status) {
            if (!lastCbInfo || (cfg.multipleCallback && lastCbInfo.level < 5)) {
                var cbInfo = {type: 'cache', status: status, level: 5, last: lastCbInfo};
                lastCbInfo = cbInfo;
                window.console && console.log(["[dlp]callback:", cbInfo]);
                cfg.success && cfg.success(cacheData.data, "success", cbInfo);
                cfg.complete && cfg.complete(cacheData.data, "success", cbInfo);
            }
        }

        if (cacheData) {
            if (cacheData.timestamp > now - cacheValidTime) {
                return callbackCache("init");
            }
            setTimeout(function () {
                callbackCache("loading");
            }, cfg.cacheDelayTime);
        }

        function success(data, textStatus){
            cache && (!cfg.localCacheVerify || cfg.localCacheVerify(data)) && cache.set(cacheKey, {
                timestamp: (+new Date),
                data: data
            });
            if (!lastCbInfo || (cfg.multipleCallback && lastCbInfo.level < 8)) {
                var cbInfo = {type: 'regular', status: "success", level: 8, last: lastCbInfo};
                lastCbInfo = cbInfo;
                window.console && console.log(["[dlp]callback:", cbInfo]);
                cfg.success && cfg.success(data, textStatus, cbInfo);
                cfg.complete && cfg.complete(data, textStatus, cbInfo);
            }
        }
        function error(data, textStatus,isVerify){
            if (!lastCbInfo || (cfg.multipleCallback && lastCbInfo.level < 2)) {
                if (cacheData) {//如果存在缓存数据，则立即使用缓存
                    callbackCache("error");
                }
                else {
                    //如果指定了备用数据，则使用备用数据
                    if (cfg.backup && cfg.backup.url) {
                        function success_b(data_b, textStatus_b){
                            var cbInfo = {
                                type: 'backup',
                                status: "backupsuccess",
                                level: 2,
                                last: lastCbInfo
                            };
                            lastCbInfo = cbInfo;
                            window.console && console.log(["[dlp]callback:", cbInfo]);
                            cfg.success && cfg.success(data_b, textStatus_b, cbInfo);
                            cfg.complete && cfg.complete(data_b, textStatus_b, cbInfo);
                        }
                        function error_b(data_b, textStatus_b){
                            var cbInfo = {
                                type: 'error',
                                status: "backuperror",
                                level: 2,
                                last: lastCbInfo
                            };
                            lastCbInfo = cbInfo;
                            S.log(["[dlp]callback:", cbInfo]);
                            if (isVerify === false) {
                                cfg.success && cfg.success(data, textStatus, cbInfo);
                            }
                            else {
                                cfg.error && cfg.error(data_b, textStatus_b, cbInfo);
                            }
                            cfg.complete && cfg.complete(data_b, textStatus_b, cbInfo);
                        }
                        onFetch(cfg.backup, function (fetch) {
                            fetch.then(function (data_b, textStatus_b) {
                                if (lastCbInfo && !(cfg.multipleCallback && lastCbInfo.level < 2)) {
                                    return;
                                }
                                (!cfg.dataVerify || cfg.dataVerify(data_b)) ? success_b(data_b, "success") : error_b(data_b, "success");
                            })
                                .catch(function (err) {
                                    if (lastCbInfo && !(cfg.multipleCallback && lastCbInfo.level < 2)) {
                                        return;
                                    }
                                    error_b(err, "error");
                                });
                        });
                    }
                    else {
                        if (!lastCbInfo || (cfg.multipleCallback && lastCbInfo.level < 8)) {
                            var cbInfo = {type: 'error', status: "error", level: 8, last: lastCbInfo};
                            lastCbInfo = cbInfo;
                            window.console && console.log(["[dlp]callback:", cbInfo]);
                            if (isVerify === false) {
                                cfg.success && cfg.success(data, textStatus, cbInfo);
                            }
                            else {
                                cfg.error && cfg.error(data, textStatus, cbInfo);
                            }
                            cfg.complete && cfg.complete(data, textStatus, cbInfo);
                        }
                    }
                }
            }
        }
        if (cfg.cache !== false) {
            //默认使用缓存
            cfg.cache = true;
            if (cfg.dataType === "jsonp" && !cfg.jsonpCallback) {
                //自动根据url计算出jsonpCallback,避免使用随机的url使得缓存失效
                cfg.jsonpCallback = "_DLP_" + parseInt((+new Date) / cacheExpiryTime) + "_" + getKey(cfg.url,cfg.data,32);
            }
        }


        onFetch(cfg, function (fetch) {
            fetch.then(function (data) {
                var isVerify = !cfg.dataVerify || cfg.dataVerify(data);
                isVerify ? success(data, "success") : error(data, "success", isVerify);
            })
                .catch(function (err) {
                    error(err, "error");
                });
        });
    },
    jsonp: function (cfg) {
        cfg.dataType = "jsonp";
        return this.get(cfg);
    },
    ald: function (cfg) {
        cfg.dataType = "jsonp";
        cfg.backup=cfg.backup||{};
        cfg.backup.dataType="jsonp";
        return this.get(cfg);
    }
};
module.exports = dlp;