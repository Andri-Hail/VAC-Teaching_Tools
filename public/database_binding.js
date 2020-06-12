	function validateEmail(email) {
	    var re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
	    return re.test(String(email).toLowerCase());
	}

	function validatePhone(phone){
		 return phone.match(/\d/g).length===10;
	}

	function loadbackenddata(){
		axios.get('/studentbackend')
			  .then(function (response) {
			  	$("#button_row").empty();
			  	window.data = response.data;
			    Object.keys(response.data).forEach(function(table){
			    	$("#button_row").append(`
			    		<p class="control">
						    <button onclick = "window.table_name = '`+table+`';fillTable(window.data.`+ table+`.schema,window.data.`+ table+`.data,'`+ table+`' );" class="button">
						      `+ dash_to_title(table) +`
						    </button>
						  </p>
			    	`);
			    })
			  })
			  .catch(function (error) {
			    console.log(error);
			  });
	}
	 function toTitleCase(str) {
	        return str.replace(
	            /\w\S*/g,
	            function(txt) {
	                return txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase();
	            }
	        );
	    }

	function dash_to_title(str){
		return  str.split("_").map(function(str){return toTitleCase(str)}).join(" ")
	}

	function fillTable(schema, rows, table_name){
		$("#table_head").empty(); $("#table_body").empty();
		$("#table_head").append($("<th>Edit</th>"))
		
		rows.forEach(function(row,index){
			if(index === 0){
				Object.keys(row).forEach(function(column){ $("#table_head").append($("<th>" + dash_to_title(column) + "</th>")) })
			}
			$("#table_body").append($("<tr><td><button onclick='edit(window.data."+ table_name+".data["+index+"], window.data."+ table_name+".schema);'>Edit</button></td> " + Object.keys(row).map(function(key){ return "<td>"+ row[key] +"</td>"}).join("") + "</tr>"))
		})

		forEach(document.getElementsByTagName("table"), function (table) {
	      if (table.className.search(/\bsortable\b/) != -1) {
	        sorttable.makeSortable(table);
	      }
	    });



	    window.table_name = table_name;

	    $("#add_button").off("click");
	    $("#add_button").on("click",function(){
	    	add(window.data[table_name].schema);
	    });

	}

	function update(table_name){
		var mailformat = /^w+([.-]?w+)*@w+([.-]?w+)*(.w{2,3})+$/;
		var phoneformat = /^\d{10}$/;

		var data = window.to_edit;
		var errors = [];
		console.log("HEREN")
		console.log(window.to_edit)
		var inputs = $("#editfieldset").children("input,textarea").map(function(){ if($(this).prop("type") === "checkbox"){return $(this).prop("checked")} return $(this).val()  })
		console.log("OOKKK")
		console.log(inputs);
		console.log($("#editfieldset").children("input,textarea").map(function(){ return $(this).attr("name")}).toArray())
		
		$("#editfieldset").children("input,textarea").map(function(){ return $(this).attr("name")}).toArray().forEach(function(name,ind){
			data[name] = inputs[ind];
		})

		console.log(window.to_edit)

		var errors = $("#editfieldset").children("input,textarea").map(function(){ 
			console.log($(this).attr("type"));
			if( $(this).attr("type") === "tel" && ! validatePhone($(this).val()) ){
				return 1
			}

			if( $(this).attr("type") === "email" && ! validateEmail($(this).val()) ){
				return 1
			}
		});

		console.log(errors);
		

		if(errors.length > 0){
			alert("Check you've entered valid emails and phone numbers");
			return;
		}
		console.log(data);

		axios.post('/studentbackend', {operation:"update", obj:data,table_name:window.table_name})
		  .then(function (response) {
		    console.log(response);
		    alert("OK! Saved")
		  })
		  .catch(function (error) {
		    console.log(error);
		});


		
			
	}


	function create(table_name){
		var mailformat = /^w+([.-]?w+)*@w+([.-]?w+)*(.w{2,3})+$/;
		var phoneformat = /^\d{10}$/;

		var data = {};
		var errors = [];
		var inputs = $("#fieldset").children("input,textarea").map(function(){ if($(this).prop("type") === "checkbox"){return $(this).prop("checked")} return $(this).val()  })
		$("#fieldset").children("input,textarea").map(function(){ return $(this).attr("name")}).toArray().forEach(function(name,ind){
			data[name] = inputs[ind];
		})

		var errors = $("#fieldset").children("input,textarea").map(function(){ 
			console.log($(this).attr("type"));
			if( $(this).attr("type") === "tel" && ! validatePhone($(this).val()) ){
				return 1
			}

			if( $(this).attr("type") === "email" && ! validateEmail($(this).val()) ){
				return 1
			}
		});

		console.log(errors);
		

		if(errors.length > 0){
			alert("Check you've entered valid emails and phone numbers");
			return;
		}
		console.log(data);

		axios.post('/studentbackend', {operation:"create", obj:data,table_name:window.table_name})
		  .then(function (response) {
		    console.log(response);
		    alert("OK! Saved")
		  })
		  .catch(function (error) {
		    console.log(error);
		});


		
			
	}

	function add(schema){
	
		$("#fieldset").empty();
		Object.keys(schema).forEach(function(column,ind){
			if(ind === 0){
				return
			}

			if(schema[column] === "class_id"){
				$("#fieldset").append($(`
					<label for="`+column+`">`+ dash_to_title(column) +`</label>
					<input id = "`+column+`" list="class_ids">

				<datalist id="class_ids">
				` + 

				window.data.vac_classes.data.map(function(c){return `<option value="`+c.class_id +`">`}).join("")


				 + `
				</datalist><br><br>`))
			}

			if(schema[column] === "boolean"){
				$("#fieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input type="checkbox" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
			
			}


			if(schema[column] === "class_id"){
				$("#fieldset").append($(`
					<label for="`+column+`">`+dash_to_title(column)+`</label>
					<input id = "`+column+`" list="class_ids">

				<datalist id="class_ids">
				` + 

				window.data.vac_classes.data.map(function(c){return `<option value="`+c.class_id +`">`}).join("")


				 + `
				</datalist><br><br>`))
			}

			if(schema[column] === "instructor_id"){
				$("#fieldset").append($(`
					<label for="`+column+`">`+dash_to_title(column)+`</label>
					<input name = "`+column+`" id = "`+column+`" list="instructor_ids">

				<datalist id="instructor_ids">
				  `+

				  window.data.vac_instructors.data.map(function(c){return `<option value="`+c.instructor_id +`">`}).join("")



				  + `
				</datalist><br><br>`))
			}

			if(schema[column] === "text"){
				$("#fieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input type="text" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
			}

			if(schema[column] === "longtext"){
				$("#fieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <textarea name="`+column+`" id="`+column+`" class="text ui-widget-content ui-corner-all"><br><br>`))
			}

			if(schema[column] === "phone"){
				$("#fieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input pattern="[0-9]{3}-[0-9]{2}-[0-9]{3}" type="tel" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
			}

			if(schema[column] === "number"){
				$("#fieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input type="number" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
		
			}

			if(schema[column] === "email"){
				$("#fieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input type="email" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
		
			}
			
		})

		window.dialog.dialog( "open" );	
	}




	function edit(schema, expected){
		window.to_edit = {...schema};
		console.log("EXPECTED");
		console.log(expected)
		$("#editfieldset").empty();
		
		Object.keys(schema).forEach(function(column,ind){
			if(ind === 0){
				return
			}

			if(expected[column] === "class_id"){
				$("#editfieldset").append($(`
					<label for="`+column+`">`+dash_to_title(column)+`</label>
					<input value = "`+ schema[column] +`" id = "`+column+`" list="class_ids">

				<datalist id="class_ids">
				` + 

				window.data.vac_classes.data.map(function(c){return `<option value="`+c.class_id +`">`}).join("")


				 + `
				</datalist><br><br>`))
			}

			if(expected[column] === "boolean"){
				$("#editfieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input type="checkbox" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
			
			}

			if(expected[column]=== "instructor_id"){
				$("#editfieldset").append($(`
				<label for="`+column+`">`+dash_to_title(column)+`</label>
					<input name="`+column+`" value = "`+ schema[column] +`" id = "`+column+`" list="instructor_ids">

				<datalist id="instructor_ids">
				  `+

				  window.data.vac_instructors.data.map(function(c){return `<option value="`+c.instructor_id +`">`}).join("")



				  + `
				</datalist><br><br>`))
			}

			if(expected[column] === "text"){
				$("#editfieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input value = "`+ schema[column] +`" type="text" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
			}

			if(expected[column] === "longtext"){
				$("#editfieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <textarea value = "`+ schema[column] +`" type="text" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
			}

			if(expected[column] === "phone"){
				$("#editfieldset").append($(`<label  for="`+column+`">`+dash_to_title(column)+`</label>
      <input value = "`+ schema[column] +`" pattern="[0-9]{3}-[0-9]{2}-[0-9]{3}" type="tel" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
			}

			if(expected[column] === "number"){
				$("#editfieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input value = "`+ schema[column] +`" type="number" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
		
			}

			if(expected[column] === "email"){
				$("#editfieldset").append($(`<label for="`+column+`">`+dash_to_title(column)+`</label>
      <input value = "`+ schema[column] +`" type="email" name="`+column+`" id="`+column+`" value="" class="text ui-widget-content ui-corner-all"><br><br>`))
		
			}
			
		})
		console.log("APPLE")
		console.log(window.to_edit)
		window.edit_dialog.dialog( "open" );	
	}







	