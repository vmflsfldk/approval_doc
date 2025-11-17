var $j = jQuery.noConflict();

approvalClass = function()
{
        _this = this;
        this.SEARCH_WORD = '';
        this.SEARCH_DRAFTER = '';
        this.SEARCH_START_DATE = '';
        this.SEARCH_END_DATE = '';
        this.PER_PAGE = 10;
        this.PAGE = 1;
        this.TOTAL_CNT = 0;
        this.LAST_PAGE = 0;
        this.DATA = [];
        this.BACKUP_INFO = null;
        this.DOCUMENT_DATA;
        this.print = '';
        this.selectedDocumentIds = new Set();
        this.isAllResultsSelected = false;
        this.allResultDocumentIds = [];
        this._selectionSnapshot = null;
        this._isFetchingAllIds = false;
        this.REQUEST_THROTTLE_MS = 400;
        this._lastFetchAt = 0;
        this._pendingFetchTimer = null;
        this._pendingFetchParams = null;
        this._isFetching = false;
        this._fetchQueued = false;
        this._activeFetchController = null;
        this._isLoading = false;
        this._toastTimer = null;
}

approvalClass.prototype = {
        setData : function(documents, info, pagination)
        {
                var initialPagination = pagination || {};
                _this.BACKUP_INFO = info || null;
                _this.SEARCH_WORD = '';
                _this.SEARCH_DRAFTER = '';
                _this.SEARCH_START_DATE = '';
                _this.SEARCH_END_DATE = '';
                _this.PER_PAGE = initialPagination.perPage || _this.PER_PAGE || 10;
                _this.PAGE = initialPagination.page || 1;
                _this.TOTAL_CNT = initialPagination.total || (_.isArray(documents) ? documents.length : 0);
                _this.DATA = _.isArray(documents) ? documents : [];
                _this.LAST_PAGE = Math.ceil(_this.TOTAL_CNT / _this.PER_PAGE);
                _this.DOCUMENT_DATA = null;
                _this._lastFetchAt = 0;
                if(_this._pendingFetchTimer){
                        clearTimeout(_this._pendingFetchTimer);
                }
                _this._pendingFetchTimer = null;
                _this._pendingFetchParams = null;
                _this._fetchQueued = false;
                if(_this._activeFetchController && typeof _this._activeFetchController.abort === 'function'){
                        _this._activeFetchController.abort();
                }
                _this._activeFetchController = null;
                _this.isAllResultsSelected = false;
                _this.allResultDocumentIds = [];
                _this._selectionSnapshot = null;
                _this._isFetchingAllIds = false;
        },

	init : function()
	{
		if(!_this.BACKUP_INFO){
			if(typeof console !== 'undefined' && console.error){
				console.error('Approval data has not been initialised.');
			}
			return;
		}

                $j('#backup_type').html(_this.BACKUP_INFO.name);
                $j('#backup_date').html(_this.BACKUP_INFO.start_date + ' ~ ' + _this.BACKUP_INFO.end_date);
                $j('#backup_register_name').html(_this.BACKUP_INFO.register_name);
                _this.SEARCH_WORD = '';
                _this.SEARCH_DRAFTER = '';
                _this.SEARCH_START_DATE = (_this.BACKUP_INFO.start_date || '');
                _this.SEARCH_END_DATE = (_this.BACKUP_INFO.end_date || '');
                _this.PAGE = 1;

                var $searchWord = $j('#search_word');
                if($searchWord.length > 0){
                        $searchWord.val(_this.SEARCH_WORD);
                }

                var $searchDrafter = $j('#search_drafter');
                if($searchDrafter.length > 0){
                        $searchDrafter.val(_this.SEARCH_DRAFTER);
                }

                var $startDate = $j('#search_start_date');
                if($startDate.length > 0){
                        $startDate.val(_this.SEARCH_START_DATE);
                }

                var $endDate = $j('#search_end_date');
                if($endDate.length > 0){
                        $endDate.val(_this.SEARCH_END_DATE);
                }

                _this.loadPage();
                _this.renderSearchConditions();
        },

        loadPage : function()
        {
                $j('#backup_list_table tbody').empty();

                if(_.isEmpty(_this.DATA)){
                        alert('데이터가 없습니다.');
                        $j('#backup_list_table tbody').html('<tr align="center"><td>데이터가 없습니다.</td></tr>');
                        $j('.paginate').hide();
                        _this.updateSelectAllState();
                        _this.updateAllSelectionToggleUI();
                        _this.updateSelectionStatus();
                        return;
                }else{
                        $j.template('left_list', LEFT_LIST);
                        $j.tmpl('left_list', _this.DATA).appendTo('#backup_list_table tbody');

                        _this.applySelectionState();

                        $j('#document_form_title').html(_this.DATA[0].form_title);

                        _this.getDocument(_this.DATA[0].no);
                        $j('.paginate').show();
                }

                _this.pageNavi();
                _this.updateSelectAllState();
                _this.updateAllSelectionToggleUI();
                _this.updateSelectionStatus();
        },

        applySelectionState : function()
        {
                $j('#backup_list_table tbody .document-select-checkbox').each(function(){
                        var documentNo = String($j(this).data('document-no'));
                        var isSelected = _this.selectedDocumentIds.has(documentNo);
                        $j(this).prop('checked', isSelected);
                        _this.toggleRowSelectionClass(documentNo, isSelected);
                });
        },

        toggleRowSelectionClass : function(documentNo, isSelected)
        {
                var rowId = '#left_document_list_' + documentNo;
                if(isSelected){
                        $j(rowId).addClass('bulk-selected');
                }else{
                        $j(rowId).removeClass('bulk-selected');
                }
        },

        updateSelectionStatus : function()
        {
                var totalSelected = _this.isAllResultsSelected ? _this.allResultDocumentIds.length : _this.selectedDocumentIds.size;
                var statusText = '';

                if(_this.isAllResultsSelected){
                        statusText = totalSelected > 0 ? ('검색 결과 전체 ' + totalSelected + '건 선택됨') : '';
                }else if(totalSelected > 0){
                        statusText = totalSelected + '건 선택됨';
                }

                $j('#bulk_download_status').text(statusText);
        },

        updateAllSelectionToggleUI : function()
        {
                var $toggle = $j('#toggle_select_all_results');
                if(!$toggle.length){
                        return;
                }

                var isActive = _this.isAllResultsSelected;
                $toggle.attr('aria-pressed', isActive ? 'true' : 'false');
                $toggle.text(isActive ? '검색 결과 전체 선택 해제' : '검색 결과 전체 선택');
        },

        updateSelectAllState : function()
        {
                var $toggle = $j('#toggle_select_all');
                if(!$toggle.length){
                        return;
                }

                $toggle.prop('disabled', _this.isAllResultsSelected);

                if(_this.isAllResultsSelected){
                        $toggle.attr('aria-pressed', 'false');
                        $toggle.text('페이지 전체 선택');
                        return;
                }

                var isAllSelected = _this.areAllCurrentDocumentsSelected();
                $toggle.attr('aria-pressed', isAllSelected ? 'true' : 'false');
                $toggle.text(isAllSelected ? '전체 해제' : '전체 선택');
        },

        areAllCurrentDocumentsSelected : function()
        {
                if(!_this.DATA || _this.DATA.length === 0){
                        return false;
                }

                for(var i=0; i<_this.DATA.length; i++){
                        var documentNo = String(_this.DATA[i].no);
                        if(!_this.selectedDocumentIds.has(documentNo)){
                                return false;
                        }
                }

                return true;
        },

        clearSelection : function()
        {
                _this.selectedDocumentIds.clear();
                _this.isAllResultsSelected = false;
                _this.allResultDocumentIds = [];
                _this._selectionSnapshot = null;
                _this.applySelectionState();
                _this.updateSelectAllState();
                _this.updateAllSelectionToggleUI();
                _this.updateSelectionStatus();
        },

        setDocumentSelected : function(documentNo, isSelected)
        {
                if(_this.isAllResultsSelected){
                        _this.isAllResultsSelected = false;
                        _this.allResultDocumentIds = [];
                        _this._selectionSnapshot = null;
                        _this.updateAllSelectionToggleUI();
                }

                var docId = String(documentNo);
                if(isSelected){
                        _this.selectedDocumentIds.add(docId);
                }else{
                        _this.selectedDocumentIds.delete(docId);
                }

                _this.toggleRowSelectionClass(docId, isSelected);
                _this.updateSelectAllState();
                _this.updateSelectionStatus();
        },

        toggleSelectAllForPage : function()
        {
                if(!_this.DATA || _this.DATA.length === 0){
                        return;
                }

                if(_this.isAllResultsSelected){
                        _this.showToast('검색 결과 전체 선택을 해제한 후 사용하세요.', true);
                        return;
                }

                var selectAll = !_this.areAllCurrentDocumentsSelected();

                for(var i=0; i<_this.DATA.length; i++){
                        _this.setDocumentSelected(_this.DATA[i].no, selectAll);
                }
        },

        updateStatusMessage : function(message)
        {
                $j('#bulk_download_status').text(message || '');
        },

        showToast : function(message, isError)
        {
                var $toast = $j('#toast_message');
                if($toast.length === 0){
                        return;
                }

                $toast.text(message || '');
                if(isError){
                        $toast.addClass('is-error');
                }else{
                        $toast.removeClass('is-error');
                }
                $toast.addClass('show');

                if(_this._toastTimer){
                        clearTimeout(_this._toastTimer);
                }

                _this._toastTimer = setTimeout(function(){
                        $toast.removeClass('show');
                }, 3200);
        },

        bulkDownloadPdf : function()
        {
                var selectedIds = Array.from(_this.selectedDocumentIds);
                var totalTargetCount = _this.isAllResultsSelected ? _this.allResultDocumentIds.length : selectedIds.length;

                if(totalTargetCount === 0){
                        _this.showToast('선택된 문서가 없습니다.', true);
                        return;
                }

                var payload = _this.isAllResultsSelected ? { useFilters: true, filters: _this.buildFilterParams(), documentIds: _this.allResultDocumentIds } : { documentIds: selectedIds };

                _this.updateStatusMessage('0/' + totalTargetCount + '건 PDF 생성 중...');

                fetch('/api/documents/pdf', {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                                'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload)
                }).then(function(response){
                        if(!response.ok){
                                return response.json().catch(function(){ return {}; }).then(function(errorBody){
                                        var message = errorBody && errorBody.error ? errorBody.error : 'PDF 생성 중 오류가 발생했습니다.';
                                        throw new Error(message);
                                });
                        }

                        return Promise.all([response.blob(), Promise.resolve(response.headers.get('content-disposition'))]);
                }).then(function(results){
                        var blob = results[0];
                        var contentDisposition = results[1] || '';
                        var filename = 'documents.zip';

                        var singleFile = totalTargetCount === 1;
                        if(singleFile){
                                var singleId = _this.isAllResultsSelected && _this.allResultDocumentIds.length > 0 ? _this.allResultDocumentIds[0] : selectedIds[0];
                                filename = 'document_' + singleId + '.pdf';
                        }

                        var match = contentDisposition.match(/filename="?([^";]+)"?/i);
                        if(match && match[1]){
                                filename = match[1];
                        }

                        var url = window.URL.createObjectURL(blob);
                        var link = document.createElement('a');
                        link.href = url;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                        window.URL.revokeObjectURL(url);

                        _this.updateStatusMessage(totalTargetCount + '/' + totalTargetCount + '건 저장 완료');
                        var successMessage = _this.isAllResultsSelected ? ('검색 결과 ' + totalTargetCount + '건의 PDF 저장을 완료했습니다.') : 'PDF 저장을 완료했습니다.';
                        _this.showToast(successMessage);
                }).catch(function(error){
                        console.error(error);
                        _this.updateStatusMessage('PDF 생성에 실패했습니다.');
                        _this.showToast(error && error.message ? error.message : 'PDF 생성에 실패했습니다.', true);
                });
        },

        renderSearchConditions : function()
        {
                if(!_this.BACKUP_INFO){
                        return;
                }

                var backupInfo = _this.BACKUP_INFO;
                var startDate = _this.SEARCH_START_DATE || backupInfo.start_date || '';
                var endDate = _this.SEARCH_END_DATE || backupInfo.end_date || '';

                var periodStart = startDate !== '' ? startDate : '전체';
                var periodEnd = endDate !== '' ? endDate : '전체';
                var conditions = [];

                conditions.push('구분 ' + (backupInfo.name || '전체'));
                conditions.push('기간 ' + periodStart + ' ~ ' + periodEnd);
                conditions.push('기안자 ' + (_this.SEARCH_DRAFTER !== '' ? _this.SEARCH_DRAFTER : '전체'));
                conditions.push('검색어 ' + (_this.SEARCH_WORD !== '' ? _this.SEARCH_WORD : '없음'));

                var summary = '조회 조건: ' + conditions.join(' / ');
                $j('#backup_title').text(summary);
        },

        buildQueryParams : function()
        {
                var filters = _this.buildFilterParams();
                filters.page = _this.PAGE;
                filters.perPage = _this.PER_PAGE;
                return filters;
        },

        buildFilterParams : function()
        {
                return {
                        searchWord: _this.SEARCH_WORD,
                        searchDrafter: _this.SEARCH_DRAFTER,
                        startDate: _this.SEARCH_START_DATE,
                        endDate: _this.SEARCH_END_DATE
                };
        },

        showLoadingState : function(isLoading)
        {
                _this._isLoading = isLoading;

                var $listContainer = $j('.backup-list');
                var $loader = $j('#document_list_loader');

                if(isLoading){
                        $listContainer.addClass('is-loading').attr('aria-busy', 'true');
                        $loader.attr('aria-hidden', 'false');
                }else{
                        $listContainer.removeClass('is-loading').attr('aria-busy', 'false');
                        $loader.attr('aria-hidden', 'true');
                }
        },

        fetchDocuments : function(params)
        {
                var query = new URLSearchParams();
                _.each(params, function(value, key){
                        if(value === undefined || value === null){
                                return;
                        }

                        query.append(key, value);
                });

                if(_this._activeFetchController && typeof _this._activeFetchController.abort === 'function'){
                        _this._activeFetchController.abort();
                }

                var controller = (typeof AbortController !== 'undefined') ? new AbortController() : null;

                if(controller){
                        _this._activeFetchController = controller;
                }else{
                        _this._activeFetchController = null;
                }

                var queryString = query.toString();
                var url = '/api/documents' + (queryString !== '' ? ('?' + queryString) : '');

                return fetch(url, {
                        credentials: 'include',
                        signal: controller ? controller.signal : undefined
                }).then(function(response){
                        if(response.ok){
                                return response.json();
                        }

                        return response.json().catch(function(){ return {}; }).then(function(errorBody){
                                var message = (errorBody && errorBody.error) ? errorBody.error : '목록을 불러올 수 없습니다.';
                                var err = new Error(message);
                                err.status = response.status;
                                throw err;
                        });
                }).finally(function(){
                        if(_this._activeFetchController === controller){
                                _this._activeFetchController = null;
                        }
                });
        },

        fetchAllDocumentIds : function()
        {
                var filterParams = _this.buildFilterParams();
                var query = new URLSearchParams();

                _.each(filterParams, function(value, key){
                        if(value === undefined || value === null){
                                return;
                        }

                        query.append(key, value);
                });

                var queryString = query.toString();
                var url = '/api/documents/ids' + (queryString !== '' ? ('?' + queryString) : '');

                return fetch(url, {
                        credentials: 'include'
                }).then(function(response){
                        if(response.ok){
                                return response.json();
                        }

                        return response.json().catch(function(){ return {}; }).then(function(errorBody){
                                var message = (errorBody && errorBody.error) ? errorBody.error : '문서 번호를 불러올 수 없습니다.';
                                var err = new Error(message);
                                err.status = response.status;
                                throw err;
                        });
                });
        },

        schedulePageLoad : function()
        {
                var params = _this.buildQueryParams();
                _this._pendingFetchParams = params;

                if(_this._pendingFetchTimer){
                        clearTimeout(_this._pendingFetchTimer);
                        _this._pendingFetchTimer = null;
                }

                if(_this._isFetching){
                        _this._fetchQueued = true;
                        return;
                }

                var now = Date.now();
                var elapsed = now - _this._lastFetchAt;
                var delay = (elapsed >= _this.REQUEST_THROTTLE_MS) ? 0 : (_this.REQUEST_THROTTLE_MS - elapsed);

                _this._pendingFetchTimer = setTimeout(function(){
                        _this._pendingFetchTimer = null;
                        _this.executePageFetch(_this._pendingFetchParams);
                }, delay);
        },

        executePageFetch : function(params)
        {
                if(!params){
                        return;
                }

                _this._isFetching = true;
                _this._lastFetchAt = Date.now();
                _this.showLoadingState(true);

                _this.fetchDocuments(params)
                        .then(function(payload){
                                var pagination = payload.pagination || {};

                                if(payload.info){
                                        _this.BACKUP_INFO = payload.info;
                                }

                                _this.PER_PAGE = pagination.perPage || _this.PER_PAGE;
                                _this.PAGE = pagination.page || _this.PAGE;
                                _this.TOTAL_CNT = pagination.total || 0;
                                _this.DATA = _.isArray(payload.documents) ? payload.documents : [];
                                _this.LAST_PAGE = Math.ceil(_this.TOTAL_CNT / _this.PER_PAGE);

                                _this.loadPage();
                                _this.renderSearchConditions();
                        })
                        .catch(function(error){
                                if(error && error.name === 'AbortError'){
                                        return;
                                }

                                console.error(error);
                                alert(error && error.message ? error.message : '목록을 불러오는 중 오류가 발생했습니다.');
                        })
                        .finally(function(){
                                _this._isFetching = false;
                                _this.showLoadingState(false);

                                if(_this._fetchQueued){
                                        _this._fetchQueued = false;
                                        _this.schedulePageLoad();
                                }
                        });
        },

        enableAllResultsSelection : function()
        {
                if(_this._isFetchingAllIds){
                        return;
                }

                _this._selectionSnapshot = new Set(_this.selectedDocumentIds);
                _this._isFetchingAllIds = true;
                _this.updateStatusMessage('검색 결과 전체를 불러오는 중...');
                _this.showLoadingState(true);

                _this.fetchAllDocumentIds()
                        .then(function(payload){
                                var ids = (payload && _.isArray(payload.documentIds)) ? payload.documentIds : [];
                                var normalizedIds = _.map(ids, function(id){ return String(id); });

                                if(normalizedIds.length === 0){
                                        _this.showToast('검색 조건에 맞는 문서가 없습니다.', true);
                                        _this.disableAllResultsSelection(true);
                                        _this.updateStatusMessage('');
                                        return;
                                }

                                _this.isAllResultsSelected = true;
                                _this.allResultDocumentIds = normalizedIds;
                                _this.selectedDocumentIds = new Set(normalizedIds);

                                _this.applySelectionState();
                                _this.updateSelectAllState();
                                _this.updateAllSelectionToggleUI();
                                _this.updateSelectionStatus();
                                _this.updateStatusMessage('검색 결과 전체 ' + normalizedIds.length + '건이 선택되었습니다.');
                                _this.showToast('검색 결과 전체 ' + normalizedIds.length + '건을 선택했습니다.');
                        })
                        .catch(function(error){
                                console.error(error);
                                _this.showToast(error && error.message ? error.message : '문서 번호를 불러오는 중 오류가 발생했습니다.', true);
                                _this.disableAllResultsSelection(true);
                                _this.updateStatusMessage('');
                        })
                        .finally(function(){
                                _this._isFetchingAllIds = false;
                                _this.showLoadingState(false);
                        });
        },

        disableAllResultsSelection : function(skipStatusReset)
        {
                _this.isAllResultsSelected = false;
                _this.allResultDocumentIds = [];

                if(_this._selectionSnapshot){
                        _this.selectedDocumentIds = new Set(_this._selectionSnapshot);
                }else{
                        _this.selectedDocumentIds = new Set();
                }

                _this._selectionSnapshot = null;
                _this.applySelectionState();
                _this.updateSelectAllState();
                _this.updateAllSelectionToggleUI();
                _this.updateSelectionStatus();

                if(!skipStatusReset){
                        _this.updateStatusMessage('');
                }
        },

        toggleSelectAllResults : function()
        {
                if(_this.isAllResultsSelected){
                        _this.disableAllResultsSelection();
                        _this.showToast('검색 결과 전체 선택을 해제했습니다.');
                        return;
                }

                _this.enableAllResultsSelection();
        },

        pageNavi : function()
        {
		var paging_size = 5;
		var first_page = 1;
		var last_page = Math.ceil(_this.TOTAL_CNT / _this.PER_PAGE);
		
		var half = parseInt(paging_size / 2);
		
		var start_page = (_this.PAGE > half) ? (_this.PAGE - half) : 1;
		var end_page = start_page + paging_size - 1;
		
		if(paging_size < last_page){
			end_page = (end_page > last_page) ? last_page : end_page;
			start_page = ((end_page - paging_size) < start_page) ? (end_page - paging_size + 1) : start_page
		}else{
			end_page = last_page;
			start_page = first_page;
		}
		
		var prev_page = ((_this.PAGE - 1) <= 0) ? 1 : _this.PAGE - 1;
		var next_page = ((_this.PAGE + 1) > end_page) ? _this.PAGE : (_this.PAGE + 1);
		
		var html = '';
		
		if(last_page != 0){
			if(_this.PAGE != 1){
				html += '<a href="javascript:void(0);" title="처음" onclick="Approval.setPage('+first_page+')"><span class="icon pagenav1"><em class="blind">처음 페이지 이동</em></span></a>';
				html += '<a href="javascript:void(0);" title="이전" onclick="Approval.setPage('+prev_page+')" class="space"><span class="icon pagenav2"><em class="blind">이전 페이지 이동</em></span></a>';
			}
		}
		
		html += '<span class="vm"><input type="text" value="'+_this.PAGE+'" style="width: 36px" id="current_page_num" class="input-pagenum"> / ';
		html += '<span class="all-pangenum">'+last_page+'</span></span>';
		
		if(last_page != 0){
			if(_this.PAGE != last_page){
				html += '<a href="javascript:void(0);" title="다음" onclick="Approval.setPage('+next_page+')"><span class="icon pagenav3"><em class="blind">다음 페이지 이동</em></span></a>';
				html +=	'<a href="javascript:void(0);" title="끝" onclick="Approval.setPage('+last_page+')" class="space"><span class="icon pagenav4"><em class="blind">끝 페이지 이동</em></span></a>';
			}
		}
		
		$j('.paginate').html(html);
	},
	
        setPage : function(page)
        {
                var nextPage = parseInt(page, 10);

                if(isNaN(nextPage) || nextPage <= 0){
                        nextPage = 1;
                }

                if(_this.LAST_PAGE > 0 && nextPage > _this.LAST_PAGE){
                        nextPage = _this.LAST_PAGE;
                }

                if(nextPage <= 0){
                        nextPage = 1;
                }

                if(nextPage === _this.PAGE && !_this._isFetching){
                        return;
                }

                _this.PAGE = nextPage;
                _this.schedulePageLoad();
        },

        validateDateRange : function(startDate, endDate)
        {
                if(startDate !== '' && endDate !== '' && startDate > endDate){
                        alert('시작일은 종료일보다 늦을 수 없습니다.');
                        return false;
                }

                return true;
        },

        searchDocument : function()
        {
                var searchWord = $j.trim($j('#search_word').val() || '');
                var searchDrafter = $j.trim($j('#search_drafter').val() || '');
                var startDate = $j('#search_start_date').val() || '';
                var endDate = $j('#search_end_date').val() || '';

                if(!_this.validateDateRange(startDate, endDate)){
                        return;
                }

                _this.PAGE = 1;
                _this.SEARCH_WORD = searchWord;
                _this.SEARCH_DRAFTER = searchDrafter;
                _this.SEARCH_START_DATE = startDate;
                _this.SEARCH_END_DATE = endDate;
                _this.clearSelection();
                _this.renderSearchConditions();
                _this.schedulePageLoad();
        },
	
	getDocument : function(document_no)
	{
		_this.DOCUMENT_DATA = _.find(_this.DATA, function(data){
			return data.no == document_no;
		});
		
		$j('.selected_document').removeClass('selected_document');
		$j('#left_document_list_'+document_no).addClass('selected_document');
		
		var document_data = _this.DOCUMENT_DATA;
		
		$j('#document_form_title').html(document_data.form_title);
		$j('#document_basic_info').empty();
		$j('#document_approval_line').empty();

		$j.template('doc_info', DOC_INFO);
		$j.tmpl('doc_info', document_data).appendTo("#document_basic_info");
		
		var method = document_data.approval_method;
		
		if(method === 'ADEF'){
			$j.template('view_ADEF', VIEW_ADEF);
		}else if(method === 'AFGHI'){
			$j.template('view_AFGHI', VIEW_AFGHI);
		}else if(method === 'BCF'){
			$j.template('view_BCF', VIEW_BCF);
		}else if(method === 'I'){
			$j.template('view_I', VIEW_I);
		}else if(method === 'ADF'){
			$j.template('view_ADF', VIEW_ADF);
		}
		
		$j.tmpl('view_'+method, document_data.approval_line).appendTo('#document_basic_info');
		
		if(document_data.status === "6"){
			$j('#document_content_title').html('<span class="point_color">[사전 합의 요청]</span>'+document_data.title);;
		}else{
			$j('#document_content_title').html(document_data.title);;
		}
		
		$j('#document_contents').html(document_data.content);
		
		// 첨부파일 표시
		if($j('#document_attached_files .filebox').length > 0){
			$j('#document_attached_files .filebox').empty();
		}
		
		var html = '';
		
		for(var i=0; i<document_data.related_document_list.length; i++){
			html += '<span style="margin:0 20px 5px 0;">'
			html += '<img src="static/images/clip.png" alt="" /> ';
			html += document_data.related_document_list[i].document_code;
			html += '</span>'
		}
		
		if(document_data.attached_file_list != undefined && document_data.attached_file_list.length > 0){
			for(var i=0; i<document_data.attached_file_list.length; i++){
				var attach = '';
				html += '<span class="cont_file">';
				html += '<img src="'+document_data.attached_file_list[i].ext+'" />';
				html += ' <a href="'+document_data.attached_file_list[i].download_url + '" download="'+document_data.attached_file_list[i].org_file_name+'">' + document_data.attached_file_list[i].org_file_name + '</a> (' + document_data.attached_file_list[i].file_size + ')';
				html += '</span>\n';
			}
		}
		
		if(html != ''){
			$j('#document_attached_files .filebox').html(html);
			$j('#document_attached_files').show();
		}else{
			$j('#document_attached_files').hide();
		}	// 첨부파일 끝
		
		// 기록
		html = '';
		Approval.getApprovalComments();
		$j('#approvalComments').empty();
		$j('#approvalCommentsCount').html(0);
		$j('#approvalCommentsHistory').empty();
		
		if(document_data.comments.length > 0){
			for(var i=0; i<document_data.comments.length; i++){
				var comment_data = document_data.comments[i];
				var reply = comment_data.title;
				
				if(comment_data.type === 'reply'){
					reply = comment_data.comment;
				}else{
					if(comment_data.type === 'space'){
						reply = (comment_data.title === '' ? comment_data.title : (comment_data.title + '&nbsp;&nbsp;&nbsp;&nbsp;'));
					}
					
					reply = '<span style="color: #acacac;">' + reply + comment_data.comment + '</span>';
				}
				html += '<li>';
				html += '<div class="profile"><img class="myphoto" src="'+ comment_data.profile_url +'" alt=""></div>';
				html += '<div class="txt"><div class="hidden after"><p class="name bold">'+ comment_data.user_name +'</p><p class="date">'+ comment_data.regdate +'</p></div>';
				html += '<p>'+reply+'</p></div></li>';
			}
			
			$j('#approvalComments').html(html);
			$j('#approvalCommentsCount').html(document_data.comments.length);
		}
		
		html = '';
		if(document_data.comments_history.length > 0){
			for(var i=0; i<document_data.comments_history.length; i++){
				var d = document_data.comments_history[i];
				var reply = d.title;
				
				if(d.type === 'space'){
					reply = (d.title === '' ? d.title : (d.title + '&nbsp;&nbsp;&nbsp;&nbsp;'));
				}

				reply = '<span style="color: #acacac;">' + reply + d.comment + '</span>';
				html += '<li>';
				html += '<div class="profile"><img class="myphoto" src="'+ d.profile_url +'" alt=""></div>';
				html += '<div class="txt"><div class="hidden after"><p class="name bold">'+ d.user_name +'</p><p class="date">'+ d.regdate +'</p></div>';
				html += '<p>'+reply+'</p></div></li>';
			}
			
			$j('#approvalCommentsHistory').html(html);
		}
		
		if(document_data.comments.length === 0 && document_data.comments_history.length === 0){
			$j('#divCommentsArea').hide();
		}
		
		if(document_data.document_type === 'db_form'){
			$j('#btn_print_only_content').show();
		}else{
			$j('#btn_print_only_content').hide();
		}
	},
	
	documentPrint : function(pPrintMode)
	{
		var print_data = _this.DOCUMENT_DATA;
		print_data.browser = getBrowser();
		
		if(pPrintMode === 'PRINT_CONTENT'){
			print_data.print_mode = 'content';
		}else{
			print_data.print_mode = 'all';
		}
		
		print_data.print_info.loc_line_type_f = print_data.approval_method.indexOf('F');
		
		// 전체 프린트 페이지
		$j.template('print_document', PRINT_PAGE);
		var $printPage = $j('<html>').html($j.tmpl('print_document', print_data));
		
		// 첨부파일 표시		
		var html = '';
		
		html += '<p>';
		for(var i=0; i<print_data.related_document_list.length; i++){
			html += '<span><img src="./static/images/clip.png" alt="" class="attached" /> '+print_data.related_document_list[i].document_code+'</span>\n';
		}
		html += '</p>';
		
		html += '<p>';
		if(print_data.attached_file_list != undefined && print_data.attached_file_list.length > 0){
			for(var i=0; i<print_data.attached_file_list.length; i++){
				html += '<span><img src="'+print_data.attached_file_list[i].ext+'" /> ';
				html += print_data.attached_file_list[i].org_file_name;
				html += '</span>\n';
			}
		}
		html += '</p>';
		
		if(print_data.related_document_list.length > 0 || (print_data.attached_file_list != undefined && print_data.attached_file_list.length > 0)){
			$printPage.find('#print_attached_files').find('td').html(html);
			$printPage.find('#print_attached_files').show();
		}else{
			$printPage.find('#print_attached_files').hide();
		}	// 첨부파일 끝
		
		// 기록
		html = '';
		if(print_data.comments.length > 0){
			for(var i=0; i<print_data.comments.length; i++){
				var comment_data = print_data.comments[i];
				
				html += '<tr>';
				html += '<td>'+comment_data.user_name+'</td><td></td>';
				html += '<td><p class="date">'+comment_data.regdate+'</p>';
				html += '<p>'+comment_data.title+'</p>';
				html += '<p>'+comment_data.comment+'</p></td>';
				html += '</tr>';
			}
			
			$printPage.find('#print_comments tbody').html(html);
		}
		
		html = '';
		if(print_data.comments_history.length > 0){
			for(var i=0; i<print_data.comments_history.length; i++){
				var comment_data = print_data.comments_history[i];
				
				html += '<tr>';
				html += '<td>'+comment_data.user_name+'</td><td></td>';
				html += '<td><p class="date">'+comment_data.regdate+'</p>';
				html += '<p>'+comment_data.title+'</p>';
				html += '<p>'+comment_data.comment+'</p></td>';
				html += '</tr>';
			}
			
			$printPage.find('#print_comments_history tbody').html(html);
		}
		
		var printWindow = window.open('about:blank', '_blank', 'height=' + screen.height + ',width=' + 1200 + ", resizable=yes,menubar=yes, scrollbars=yes, status=yes");
		printWindow.document.write('<!doctype html>');
		printWindow.document.write($printPage.html());
		printWindow.document.write('<script src="static/scripts/print.js" type="text/javascript"></script>');
		printWindow.document.close();
	}
	
	,getApprovalComments : function(){
		$j('#document_approval_comments').show();
		$j('#divApprovalCommentsHistory').hide();
		$j('#approvalCommentsTab .gt-active').removeClass('gt-active');
		$j('.approval-comments-tab1').addClass('gt-active');
	}
	
	,getApprovalCommentsHistory : function(){
		$j('#document_approval_comments').hide();
		$j('#divApprovalCommentsHistory').show();
		$j('#approvalCommentsTab .gt-active').removeClass('gt-active');
		$j('.approval-comments-tab2').addClass('gt-active');
	}
}

var Approval = new approvalClass();

$j(document).ready(function(){
        Approval.init();

        $j(document).on('click', '.document-select', function(e){
                e.stopPropagation();
        });

        $j(document).on('change', '.document-select-checkbox', function(e){
                e.stopPropagation();
                var documentNo = $j(this).data('document-no');
                var isChecked = $j(this).is(':checked');
                Approval.setDocumentSelected(documentNo, isChecked);
        });

        $j(document).on('click', '#toggle_select_all', function(){
                Approval.toggleSelectAllForPage();
        });

        $j(document).on('click', '#toggle_select_all_results', function(){
                Approval.toggleSelectAllResults();
        });

        $j(document).on('click', '#bulk_download_pdf', function(){
                Approval.bulkDownloadPdf();
        });

        $j(document).on('submit', '#documentFilterForm', function(e){
                e.preventDefault();
                Approval.searchDocument();
        });

        $j(document).on('keydown', '#search_word, #search_drafter, #search_start_date, #search_end_date', function(e){
                if(e.keyCode === 13){
                        e.preventDefault();
                        Approval.searchDocument();
                        return false;
                }
        });

        $j(document).on('change', '#search_start_date, #search_end_date', function(){
                var startDate = $j('#search_start_date').val() || '';
                var endDate = $j('#search_end_date').val() || '';

                if(!Approval.validateDateRange(startDate, endDate)){
                        $j(this).val('');
                        $j(this).focus();
                }
        });

        $j(document).on('click', '#reset_document_filters', function(){
                var backupInfo = Approval.BACKUP_INFO || {};
                $j('#search_word').val('');
                $j('#search_drafter').val('');
                $j('#search_start_date').val(backupInfo.start_date || '');
                $j('#search_end_date').val(backupInfo.end_date || '');
                Approval.searchDocument();
        });

        $j("#drag").draggable({
        containment: "#drag_wrap",
        scroll: false,
        axis: "x"
    });
    // $( "#drag" ).draggable({
    // drag: function(event) {
    //     var top = $(this).position().top;
    //     var left = $(this).position().left + 255;
    //     //console.log(left);
    //     $('#leftmenu').css({'width':left});
    //     $('#contents').css({'left':left});
    // }});

    $j("#drag").draggable({
        drag: function(event) {
            var top = $j(this).position().top;
            var left = $j(this).position().left + 320;
            //console.log(left);
            $j('#leftmenu').css({
                'width': left
            });
            $j('#contents').css({
                'left': left
            });
        },
        stop: function(event, ui) {
            setCookie('office_lnb_width', $j('#leftmenu').width(), 365);
            //alert(document.cookie);
        }
    });
    
    $j(document).on('keydown', '#current_page_num', function(e){
    	if(e.keyCode == 13){
    		Approval.setPage($j('#current_page_num').val());
    	}
    });
    
    $j('.tipsIcon').bind('mouseenter focusin',function() {
        $j(this).siblings('.tooltip').addClass('show');
    });
    $j('.tipsIcon').bind('mouseleave focusout',function() {
        $j(this).siblings('.tooltip').removeClass('show');
    });
});