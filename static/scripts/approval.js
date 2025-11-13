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
        this.REQUEST_THROTTLE_MS = 400;
        this._lastFetchAt = 0;
        this._pendingFetchTimer = null;
        this._pendingFetchParams = null;
        this._isFetching = false;
        this._fetchQueued = false;
        this._activeFetchController = null;
        this._isLoading = false;
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
			return;
		}else{
			$j.template('left_list', LEFT_LIST);
			$j.tmpl('left_list', _this.DATA).appendTo('#backup_list_table tbody');
			
			$j('#document_form_title').html(_this.DATA[0].form_title);
			
			_this.getDocument(_this.DATA[0].no);
			$j('.paginate').show();
		}

                _this.pageNavi();
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
                return {
                        page: _this.PAGE,
                        perPage: _this.PER_PAGE,
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