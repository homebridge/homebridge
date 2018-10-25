(function() {

	'use strict';

	var DOMReady = function(a,b,c){b=document,c='addEventListener';b[c]?b[c]('DOMContentLoaded',a):window.attachEvent('onload',a)}
	var sampleCommands = [
		'Good Morning, Siri',
		'Siri, turn on the coffee machine',
		'Good Night!',
		'Turn down the cinema room lights',
		'Set the Netflix and Chill scene',
		'Open the garage door',
		'Start my robot vaccuum cleaner',
		'Close the blinds, Siri!',
		'Run "Aziz, Light"',
		'Turn off the driveway lights',
		'Set living room to 20 degrees',
		'Siri, unlock the front door',
		'Arm the alarm system',
		'Siri, turn off the smoke alarm'
	];
	var levels = [{
		id: 1,
		className: '__lvl1',
		parallaxSpeed: 7
	}, {
		id: 2,
		className: '__lvl2',
		parallaxSpeed: 5.5
	}, {
		id: 3,
		className: '__lvl3',
		parallaxSpeed: 2.5
	}, {
		id: 4,
		className: '__lvl4',
		parallaxSpeed: 0.5
	}];

	var form = document.getElementById('searchForm');
	var input = document.getElementById('searchInput');
	var link = document.createElementNS('http://www.w3.org/1999/xhtml', 'a');

	form.addEventListener('submit', function(e) {

		var url = 'https://www.npmjs.com/search?q=keywords%3Ahomebridge-plugin%20' + encodeURIComponent(input.value);
		openURL(url);

		e.preventDefault();
		e.stopPropagation();
		return false;
	});

	function openURL(href) {
		link.href = href;
		link.target = '_blank';
		var event = new MouseEvent('click', {
			'view': window,
			'bubbles': false,
			'cancelable': true
		});
		link.dispatchEvent(event);
	}

	var ac = new autoComplete({
		selector: 'DISABLED-input[name=test]',
		minChars: 2,
		delay: 300,
	    source: function(term, suggest) {
	        fetch('http://npmsearch.com/query?q=keywords:homebridge-plugin AND ' + term + '&fields=name,modified,rating')
	        	.then(res => res.json())
		        .then((data) => {
	    			console.log(data);
	    			console.log(results);
		        	var results = _.map(data.results, (item) => {
		        		return item;
		        	});
	    			suggest(results);
	    		});
	    },
	    renderItem: function (item, search){
		    search = search.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
		    var re = new RegExp("(" + search.split(' ').join('|') + ")", "gi");
		    return `<a href="https://www.npmjs.com/package/${item.name[0]}" class="autocomplete-suggestion" data-val="${item.name[0]}" target="_blank" tabindex="0">
						<span>${item.name[0].replace(re, '<b>$1</b>')}</span><br>
						${item.rating[0]}
					</a>`;
		},
		onSelect: function(event, term, item) {
			item.click();
		}
	});

	initialise();

	return;

	//////////////////

	function initialise() {

	    DOMReady(function () {

	    	for (var i = 0; i < 10; i++) {
				createCommandHtml(true);
	    	}

			// var rellax = new Rellax('.rellax');

	    });

	    document.addEventListener('webkitAnimationEnd', onAnimationEnded);

	}

	function onAnimationEnded(e) {
		var $e = e.target.parentNode;
		var $anim = e.animationName;
		if ($anim.match('level')) {
			$e.parentNode.removeChild($e);
			createCommandHtml();
		}
	}

	function startTimer() {

	}

	function createCommandHtml(firstRun) {
		var output = document.getElementById('commandParallax');
		var lvl = _.sample(levels);
		var commandText = _.sample(sampleCommands);
		var commandHtml = `
			<span
				class="command ${lvl.className} rellax"
				style="${randomisePosition(firstRun)}"
				data-rellax-speed="${lvl.parallaxSpeed}">
					<span>${commandText}</span>
			</span>
		`;
		output.insertAdjacentHTML('beforeend', commandHtml);
	}

	function randomisePosition(firstRun) {
		var styles = {};
		var x = _.random(5,90);
		var y = _.random(-5,80);
		styles.bottom = y + '%';
		styles.left = x + '%';
		if (firstRun) {
			styles.animationDelay = _.random(-2.2, .8) + 's';
		}
		return _.map(styles, function(value, key) {
			return key + ': ' + value;
		}).join('; ');
	}

}());
