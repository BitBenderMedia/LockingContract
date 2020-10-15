pragma solidity ^0.6.0;
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/math/SafeMath.sol";

contract GalaTokenTimeLock {
    using SafeMath for uint256;
    using SafeERC20 for IERC20;
    IERC20 public token;
    uint256 public constant LOCKED_PERIOD = 90 days;

    struct LockedToken {
        address depositor;
        uint256 depositTime;
        uint256 amount;
        uint256 unlockTime;
        bool isWithdrawn;
    }

    LockedToken[] public lockInfo;
    mapping(address => uint256[]) public lockIDs;

    //EVENT
    event Deposit(
        address indexed _depositor,
        uint256 indexed _amount,
        uint256 indexed _time
    );
    event Unlock(
        address indexed _depositor,
        uint256 indexed _amount,
        uint256 indexed _time
    );

    constructor(IERC20 _token) public {
        token = _token;
    }

    function deposit(uint256 _amount) public {
        token.safeTransferFrom(msg.sender, address(this), _amount);
        uint256 lockedLength = lockInfo.length;
        lockInfo.push(
            LockedToken({
                depositor: msg.sender,
                depositTime: block.timestamp,
                amount: _amount,
                unlockTime: block.timestamp.add(LOCKED_PERIOD),
                isWithdrawn: false
            })
        );
        lockIDs[msg.sender].push(lockedLength);
        emit Deposit(msg.sender, _amount, block.timestamp);
    }

    function withdraw(uint256 _lockID) public {
        require(isWithdrawnable(_lockID), "Token is not withdrawnable");

        lockInfo[_lockID].isWithdrawn = true;
        token.safeTransfer(
            lockInfo[_lockID].depositor,
            lockInfo[_lockID].amount
        );
        emit Unlock(
            lockInfo[_lockID].depositor,
            lockInfo[_lockID].amount,
            block.timestamp
        );
    }

    function isWithdrawnable(uint256 _lockID) public view returns (bool) {
        return
            (_lockID < lockInfo.length) &&
            (!lockInfo[_lockID].isWithdrawn) &&
            (lockInfo[_lockID].unlockTime < block.timestamp) &&
            (lockInfo[_lockID].amount > 0);
    }

    function getNumDeposits(address _depositor) public view returns (uint256) {
        return lockIDs[_depositor].length;
    }

    function getTotalNumDeposits() public view returns (uint256) {
        return lockInfo.length;
    }

    function getWithdrawnableList(address _depositor)
        public
        view
        returns (uint256[] memory ids)
    {
        if (lockIDs[_depositor].length == 0) return ids;

        uint256[] memory initials = new uint256[](lockIDs[_depositor].length);
        uint256 count = 0;
        uint256 i = 0;
        for (i = 0; i < lockIDs[_depositor].length; i++) {
            if (isWithdrawnable(lockIDs[_depositor][i])) {
                initials[count] = i;
                count++;
            }
        }
        if (count > 0) {
            ids = new uint256[](count);
            for (i = 0; i < count; i++) {
                ids[i] = i;
            }
        }
    }
}
