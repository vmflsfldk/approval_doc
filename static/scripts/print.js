var $j = jQuery.noConflict();

var printClass = function()
{
	_this = this;
	this.printSetting = {'empty_items':'N', 'comment':'Y', 'simple':'N', 'line_type_f':'N', 'comment_history':'N'}
};

printClass.prototype = {
	init : function()
	{
		$j('#print_content').find('.account-area').removeAttr('class').addClass('account');
		$j('#print_content').find('.tableType01').removeAttr('class');
	
		this.getPrintSetting();
		this.setPrintSetting();
		this.refreshPrintPage(this.printSetting);
		window.print();
	},
	
	refreshPrintPage : function(obj)
	{		
		var second_view = $j('#second_line_flag').val();
		var third_view = $j('#third_line_flag').val();
		var fourth_view = $j('#fourth_line_flag').val();
		var found_f = $j('#loc_line_type_f').val();
		
		// 간략 인쇄
		if(obj.simple === 'Y'){
			$j('#print-document-basic').hide();
			$j('#print-document-simple').show();
		}else{
			$j('#print-document-basic').show();
			$j('#print-document-simple').hide();
		}
		
		// 결재선
		if(obj.empty_items == 'N'){				
			if($j('#print-document-basic:visible').length && $j('.print_other_line2').hasClass('print_other_line3')){
				if(second_view == 'Y' && third_view == 'N'){
					$j('.no-third-line').show();
					$j('.print_other_line2').hide();
				}else if(second_view == 'N' && third_view == 'N'){
					$j('.print_other_line2').hide();
				}else if(second_view == 'N' && third_view == 'Y'){
					$j('.no-second-line').show();
					$j('.print_other_line2').hide();
				}
				if(fourth_view == 'N'){
					$j('.print_other_line4').hide();
				}
			}else{
				if(second_view == 'N'){
					$j('.no-third-line').show();
					$j('.print_other_line2').hide();
				}
				if(third_view == 'N'){
					$j('.print_other_line3').hide();
				}
				if(fourth_view == 'N'){
					$j('.print_other_line4').hide();
				}
			}
		}else{
			$j('.no-third-line').hide();
			$j('.no-second-line').hide();
			$j('.print_other_line2').show();
			$j('.print_other_line3').show();
			$j('.print_other_line4').show();
		}
		
		if(obj.line_type_f === 'N'){
			if(found_f === '1'){
				$j('.print_other_line2').hide();
			}else if(found_f === '2'){
				$j('.print_other_line3').hide();
			}else if(found_f === '3'){
				$j('.print_other_line4').hide();
			}
		}else{
			if(found_f === '1'){
				$j('.print_other_line2').show();
			}else if(found_f === '2'){
				$j('.print_other_line3').show();
			}else if(found_f === '3'){
				$j('.print_other_line4').show();
			}
		}
		
		// 기록
		if(obj.comment == 'Y' && $j('#print_comments table tbody tr').length){
			$j('#print_comments').show();
		}else{
			$j('#print_comments').hide();
		}
		
		if(obj.comment_history == 'Y' && $j('#print_comments_history table tbody tr').length){
			$j('#print_comments_history').show();
		}else{
			$j('#print_comments_history').hide();
		}
	},
	
	showPrintSetting: function()
	{
		this.getPrintSetting();
		this.setPrintSetting();

		$j('#layerApprovalPrintSetting').showPopup();
	}

	,hidePrintSetting: function(pType)
	{
		if(pType){
			var print_empty = $j("input:radio[name='print_of_empty_items']:checked").val();
			var print_of_comment = $j("input:radio[name='print_of_comment']:checked").val();
			var print_of_simple = $j("input:radio[name='print_of_simple']:checked").val();
			var print_of_comment_history = $j("input:radio[name='print_of_comment_history']:checked").val();
			var print_of_line_type_f = $j("input:radio[name='print_of_line_type_f']:checked").val();

			if($j("input:checkbox[name='memory_print_setting']:checked").val() === "Y"){
				setCookie('print_empty', print_empty, 365, window.opener);
				setCookie('print_of_comment', print_of_comment, 365, window.opener);
				setCookie('print_of_simple', print_of_simple, 365, window.opener);
				setCookie('print_of_comment_history', print_of_comment_history, 365, window.opener);
				setCookie('print_of_line_type_f', print_of_line_type_f, 365, window.opener);
			}
			
			this.refreshPrintPage({
				'empty_items' : print_empty,
				'comment' : print_of_comment,
				'simple' : print_of_simple,
				'comment_history' : print_of_comment_history,
				'line_type_f' : print_of_line_type_f
			});
		}

		$j('#layerApprovalPrintSetting').hidePopup(false);
		window.print();
	}

	,getPrintSetting: function()
	{
		var print_empty = getCookie('print_empty', window.opener);
		if(print_empty){
			this.printSetting.empty_items = print_empty;
		}else{
			setCookie('print_empty', this.printSetting.empty_items, 365, window.opener);
		}
		
		var print_of_comment = getCookie('print_of_comment', window.opener);
		if(print_of_comment){
			this.printSetting.comment = print_of_comment;
		}else{
			setCookie('print_of_comment', this.printSetting.comment, 365, window.opener);
		}
		
		var print_of_simple = getCookie('print_of_simple', window.opener);
		if(print_of_simple){
			this.printSetting.simple = print_of_simple;
		}else{
			setCookie('print_of_simple', this.printSetting.simple, 365, window.opener);
		}
		
		var print_of_comment_history = getCookie('print_of_comment_history', window.opener);
		if(print_of_comment_history){
			this.printSetting.comment_history = print_of_comment_history;
		}else{
			setCookie('print_of_comment_history', this.printSetting.comment_history, 365, window.opener);
		}
		
		var print_of_line_type_f = getCookie('print_of_line_type_f', window.opener);
		if(print_of_line_type_f){
			this.printSetting.line_type_f = print_of_line_type_f;
		}else{
			setCookie('print_of_line_type_f', this.printSetting.line_type_f, 365, window.opener);
		}
	}

	,setPrintSetting: function()
	{
		$j("input:radio[name='print_of_empty_items'][value='" + this.printSetting.empty_items + "']").prop("checked", true);
		$j("input:radio[name='print_of_comment'][value='" + this.printSetting.comment + "']").prop("checked", true);
		$j("input:radio[name='print_of_simple'][value='" + this.printSetting.simple + "']").prop("checked", true);
		$j("input:radio[name='print_of_comment_history'][value='" + this.printSetting.comment_history + "']").prop("checked", true);
		$j("input:radio[name='print_of_line_type_f'][value='" + this.printSetting.line_type_f + "']").prop("checked", true);
	}
}

var ApprovalPrint = new printClass();

$j(document).ready(function(){
	ApprovalPrint.init();
	
	$j('.tipsIcon').bind('mouseenter focusin',function() {
        $j(this).siblings('.tooltip').addClass('show');
    });
    $j('.tipsIcon').bind('mouseleave focusout',function() {
        $j(this).siblings('.tooltip').removeClass('show');
    });
});