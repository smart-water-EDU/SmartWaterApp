/** Plain date/time presentation using the app's nominal UTC fields. */
export function createCalendarClock({onOpen}) {
  const button=document.getElementById('simulation-calendar-button');
  const dialog=document.getElementById('simulation-calendar-dialog');
  const input=document.getElementById('simulation-time');
  const close=()=>dialog.close();
  const sync=()=>button.setAttribute('aria-expanded',String(dialog.open));
  button.addEventListener('click',()=>{onOpen();dialog.showModal();sync();input.focus();});
  dialog.querySelectorAll('[data-close-calendar]').forEach(node=>node.addEventListener('click',close));
  dialog.addEventListener('close',sync);
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  return {
    update(stamp) {
      const fields={day:String(stamp.getUTCDate()).padStart(2,'0'),
        month:stamp.toLocaleString('en-GB',{month:'short',timeZone:'UTC'}),
        year:String(stamp.getUTCFullYear()),hour:String(stamp.getUTCHours()).padStart(2,'0'),
        minute:String(stamp.getUTCMinutes()).padStart(2,'0')};
      for(const [name,value] of Object.entries(fields))button.querySelector(`[data-calendar-field="${name}"]`).textContent=value;
      const date=stamp.toLocaleDateString('en-GB',{day:'numeric',month:'long',year:'numeric',timeZone:'UTC'});
      button.setAttribute('aria-label',`Change simulation date and time: ${date}, ${fields.hour}:${fields.minute}`);
      button.title=`${date} · ${fields.hour}:${fields.minute} — select to edit`;
    }
  };
}
