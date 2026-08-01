// Hide menu and links if not admin
function checkManageMenuAccess() {
  const userLgu = sessionStorage.getItem('userLgu');
  const isNotAll = userLgu !== 'All';

  // Helper function to hide an element or its parent <li>
  function setVisibility(element, hide) {
    if (!element) return;
    const parentLi = element.closest('li');
    const targetElement = parentLi || element;
    targetElement.style.display = hide ? 'none' : '';
  }

  // 1. Manage Menu link (#manageMenu)
  const manageMenu = document.querySelector('a[href="#manageMenu"]');
  setVisibility(manageMenu, isNotAll);

  // 2. Users link (users.html) - select all matching links
  const usersLinks = document.querySelectorAll('a[href="users.html"]');
  usersLinks.forEach(link => {
    setVisibility(link, isNotAll);
  });
}

// Run on page load
document.addEventListener('DOMContentLoaded', checkManageMenuAccess);