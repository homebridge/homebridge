# Goal
This list is going to be a reference for confirmed Siri homekit commands in multiple languages. Discussions regarding new and unconfirmed commands are supposed to be held on slack in the #siricommands channel: https://homebridgeteam.slack.com/messages/siricommands

Please add languages of interest at will!

***

Confirmed commands

<table>
<tr><td><b>Service</b></td><td><b>Action</b></td><td>English</td><td>German</td><td>French</td><td>Italian</td><td>Nederlands</td><td>Swedish</td></tr>

<tr><td><b>Lightbulb</b></td><td>On/Off</td><td>Turn on/off the light [in room/zone]</td><td>Schalte das Licht [in Raum/Bereich] an/aus</td><td>Allume/Eteint [Nom-de-la-lumiére] [dans la-pièce/la-zone] ou Allume/Eteint [la-pièce/la-zone]</td><td>Accendi le luci[In una stanza/In una zona]</td><td>Doe het licht aan/uit [in de kamer/zone] </td><td>Tänd/Släck lampan [i rum/zon]</td></tr>

<tr><td><b>Switch</b></td><td>On/Off</td><td>Switch on/off the [service-name] [in room/zone]</td><td>Schalte [Service-Name] [in Raum/Bereich] an/aus</td><td>Allume/Eteint le [Nom-du-service] [dans la-pièce/la-zone]</td><td><td>Zet de [naam schakelaar] aan/uit [in de kamer/zone] </td></tr>

<tr><td><b>Thermostat</b></td><td>Query current temperature</td><td>What is the temperature in &lt;room&gt;</td><td>Wie warm ist es in &lt;Raum&gt;<br>Wie hoch ist die Temperatur in &lt;Raum&gt;(1)</td><td>Quelle est la température [dans la-pièce/la-zone]</td><td><td>Wat is de temperatuur in [de kamer/zone] </td><td>Vad är temperaturen i [rum/zon]</td></tr>

<tr><td><b>Shutters</b></td><td>Up/Down</td><td></td><td>Öffne/Schließe die Jalousien in <Raum></td><td>Monte/Descend [Nom-du-rideau]</td><td>Abbassa/Alza la tapparella [nome]</td><td></td></tr>
<tr>
  <td><b>Garage door</b></td>
  <td>Open/close</td>
  <td>open/close [name of garage door service]</td>
  <td>Öffne/Schließe [Name des Tor-Service]</td>
</tr>
</table>

## Footnotes
(1) In German, the two questions lead to different results: "How warm is it in room X?" is answered with just a number, such as "21" (meaning 21°C); whereas, "What is the temperature in room X?" results in an answer freely translated to "The thermostat is set to 21 degrees celsius", sounding like it was supposed to be the answer to the question for the TARGET temperature, however, the temperature given by Siri is always the CURRENT temperature.